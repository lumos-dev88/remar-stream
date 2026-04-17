/**
 * useShikiWorker — Web Worker hook for Shiki syntax highlighting
 *
 * Manages a single Worker instance, dispatches highlight requests,
 * and returns results via callback. Falls back to main-thread highlighting
 * if Worker is unavailable (SSR, CSP restrictions, etc.).
 *
 * Features:
 * - Single Worker instance (lazy created, shared across all CodeBlocks)
 * - Worker-ready-then-highlight: ensures Worker is initialized before sending requests
 * - Automatic cleanup on unmount
 * - Graceful fallback to main-thread if Worker fails
 */

import { useCallback, useEffect, useRef } from 'react';
import type { ThemedToken } from '@shikijs/core';

// ─── Types ────────────────────────────────────────────────────────────

export interface ShikiWorkerResult {
  tokens: ThemedToken[][];
  fg: string;
  bg: string;
}

export interface ShikiWorkerRequest {
  code: string;
  lang: string;
  callback: (result: ShikiWorkerResult) => void;
}

// ─── Worker URL resolution ────────────────────────────────────────────
//
// Strategy (in priority order):
// 1. Package export: `new Worker(new URL('remar-stream/shiki-worker', import.meta.url))`
//    — Vite/webpack 5+ resolve this from node_modules via package.json "exports"
// 2. Relative path fallback: `new URL('./shiki-worker.worker.js', import.meta.url)`
//    — Works when the consuming app's bundler copies the worker file alongside the bundle
// 3. Return null → main-thread fallback

let workerUrl: string | null = null;

function getWorkerUrl(): string | null {
  if (workerUrl !== null) return workerUrl;

  try {
    // Strategy 1: Package export (preferred)
    workerUrl = new URL(
      'remar-stream/shiki-worker',
      import.meta.url,
    ).href;
    return workerUrl;
  } catch {
    // Strategy 2: Relative path fallback
    try {
      workerUrl = new URL(
        './shiki-worker.worker.js',
        import.meta.url,
      ).href;
      return workerUrl;
    } catch {
      // import.meta.url not available (e.g., CJS environment)
      return null;
    }
  }
}

// ─── Worker Singleton ─────────────────────────────────────────────────

let workerInstance: Worker | null = null;
let workerInitPromise: Promise<Worker | null> | null = null;
let requestCounter = 0; // 递增计数器，确保请求 ID 全局唯一

function getWorker(): Promise<Worker | null> {
  if (workerInstance) return Promise.resolve(workerInstance);
  if (workerInitPromise) return workerInitPromise;

  const url = getWorkerUrl();
  if (!url) return Promise.resolve(null);

  workerInitPromise = new Promise((resolve) => {
    try {
      const w = new Worker(url, { type: 'module' });

      // Wait for Worker to signal readiness (or error)
      // Don't resolve immediately — wait for onmessage/onerror
      const readyHandler = () => {
        w.removeEventListener('message', readyHandler);
        w.removeEventListener('error', errorHandler);
        workerInstance = w;
        resolve(w);
      };

      const errorHandler = () => {
        w.removeEventListener('message', readyHandler);
        w.removeEventListener('error', errorHandler);
        workerInstance = null;
        workerInitPromise = null;
        resolve(null);
      };

      w.addEventListener('message', readyHandler);
      w.addEventListener('error', errorHandler);

      // Send a ping to verify Worker loaded successfully
      w.postMessage({ type: 'ping' });

      // Timeout: if Worker doesn't respond within 3s, resolve null
      setTimeout(() => {
        if (workerInstance === null && workerInitPromise !== null) {
          w.removeEventListener('message', readyHandler);
          w.removeEventListener('error', errorHandler);
          workerInitPromise = null;
          try { w.terminate(); } catch { /* ignore */ }
          resolve(null);
        }
      }, 3000);
    } catch {
      workerInitPromise = null;
      resolve(null);
    }
  });

  return workerInitPromise;
}

// ─── Hook ─────────────────────────────────────────────────────────────

/**
 * Provides a `highlight` function that runs shiki in a Web Worker.
 *
 * Key design: highlight() returns a Promise that resolves when Worker is ready.
 * This ensures Worker initialization completes before sending highlight requests,
 * avoiding the race condition where workerRef.current is null on first render.
 */
export function useShikiWorker() {
  // Store pending requests to be sent once Worker is ready
  const pendingRequestsRef = useRef<Array<{
    id: string;
    code: string;
    lang: string;
    callback: (result: ShikiWorkerResult) => void;
  }>>([]);

  const workerRef = useRef<Worker | null>(null);
  const initDoneRef = useRef(false);

  // Initialize Worker on mount — only once
  useEffect(() => {
    let mounted = true;

    getWorker().then((w) => {
      if (!mounted) return;
      workerRef.current = w;
      initDoneRef.current = true;

      // Flush any pending requests that arrived before Worker was ready
      if (w && pendingRequestsRef.current.length > 0) {
        const pending = [...pendingRequestsRef.current];
        pendingRequestsRef.current = [];
        for (const req of pending) {
          sendToWorker(w, req.id, req.code, req.lang, req.callback);
        }
      }
    });

    return () => {
      mounted = false;
      // Don't terminate the Worker — it's a singleton shared across components
    };
  }, []);

  const highlight = useCallback((request: ShikiWorkerRequest) => {
    const { code, lang, callback } = request;
    const id = `${lang}:${code.length}:${Date.now()}:${++requestCounter}`;

    const worker = workerRef.current;

    if (worker) {
      // Worker is ready — send immediately
      sendToWorker(worker, id, code, lang, callback);
    } else if (initDoneRef.current) {
      // Worker init completed but failed (null) — fallback immediately
      callback({ tokens: [], fg: '', bg: '' });
    } else {
      // Worker still initializing — queue the request
      pendingRequestsRef.current.push({ id, code, lang, callback });
    }
  }, []);

  return { highlight };
}

// ─── Internal: Send highlight request to Worker ───────────────────────

function sendToWorker(
  worker: Worker,
  id: string,
  code: string,
  lang: string,
  callback: (result: ShikiWorkerResult) => void,
) {
  const handler = (e: MessageEvent) => {
    const msg = e.data;

    // Ignore non-highlight responses (e.g., ping echo)
    if (msg.type !== 'highlight:result' && msg.type !== 'highlight:error') return;
    if (msg.id !== id) return;

    worker.removeEventListener('message', handler);

    if (msg.type === 'highlight:result') {
      callback({
        tokens: msg.tokens,
        fg: msg.fg,
        bg: msg.bg,
      });
    } else {
      callback({ tokens: [], fg: '', bg: '' });
    }
  };

  worker.addEventListener('message', handler);
  worker.postMessage({ type: 'highlight', id, code, lang });
}
