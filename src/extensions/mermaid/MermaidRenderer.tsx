/**
 * MermaidRenderer - Non-blocking streaming with React 18 Concurrent Features
 *
 * Architecture:
 * 1. Rendering Layer: useDeferredValue + useTransition for non-blocking updates
 * 2. UI Layer: Toolbar + CodePanel + Zoom + Pan/Drag controls
 * 3. State Layer: AbortController for cancellation, refs for caching
 * 4. Interaction Layer: Drag to pan, zoom controls
 *
 * UI Features:
 * - Toolbar: Zoom, Download, Fullscreen, View Code
 * - Code Panel: Source code display with copy
 * - Zoom: 50% - 300% with fit-to-window
 * - Drag/Pan: Click and drag to move diagram
 *
 * State Management:
 * - Inline view and fullscreen view have INDEPENDENT zoom/pan/drag states
 * - Opening fullscreen starts with auto-fit; closing restores inline state
 */

'use client';

import React, {
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
  useDeferredValue,
  useTransition,
} from 'react';
import type { MermaidRendererProps } from './types';
import { logMermaid, errorMermaid } from './logger';
import { MermaidToolbar } from './MermaidToolbar';
import { MermaidCodePanel } from './MermaidCodePanel';
import { detectChartType } from './chart-detector';
import { Fullscreenable } from '../../react/components/Fullscreenable';

const STREAMING_END_DELAY_MS = 100;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

let mermaidInstance: import('mermaid').Mermaid | null = null;
let initPromise: Promise<void> | null = null;

/**
 * LRU cache for rendered SVGs — bounded to prevent memory leaks.
 * Uses insertion-order eviction: oldest entry deleted when full.
 */
const SVG_CACHE_MAX = 50;
const svgCache = new Map<string, string>();

function svgCacheSet(key: string, svg: string): void {
  if (svgCache.size >= SVG_CACHE_MAX && !svgCache.has(key)) {
    // Delete oldest entry (first key in Map iteration order)
    const oldestKey = svgCache.keys().next().value;
    if (oldestKey !== undefined) svgCache.delete(oldestKey);
  }
  // Re-insert to move to end (most recently used)
  svgCache.delete(key);
  svgCache.set(key, svg);
}

function svgCacheGet(key: string): string | undefined {
  if (!svgCache.has(key)) return undefined;
  // Move to end (most recently used)
  const value = svgCache.get(key)!;
  svgCache.delete(key);
  svgCache.set(key, value);
  return value;
}

function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).substring(0, 8);
}

function extractMermaidCode(content: string): string {
  let code = content.trim();
  if (code.startsWith('```mermaid')) {
    code = code.replace(/^```mermaid\s*/, '');
  }
  if (code.endsWith('```')) {
    code = code.replace(/```$/, '');
  }
  return code.trim();
}

async function initMermaid(theme: string): Promise<void> {
  if (mermaidInstance) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const mermaid = await import('mermaid');
    mermaid.default.initialize({
      startOnLoad: false,
      theme: theme as any,
      securityLevel: 'loose',
      flowchart: {
        useMaxWidth: true,
        htmlLabels: true,
      },
      sequence: {
        useMaxWidth: true,
      },
      journey: {
        useMaxWidth: true,
      },
    } as any);
    mermaidInstance = mermaid.default;
    logMermaid('Mermaid initialized');
  })();

  return initPromise;
}

/**
 * Check if rendered SVG contains Mermaid error indicators.
 * Only matches specific Mermaid error output patterns to avoid false positives.
 */
function isErrorSvg(svg: string): boolean {
  // Mermaid v11 primary error text
  if (svg.includes('Syntax error in text')) return true;
  // Mermaid error container (specific class used by mermaid error renderer)
  if (svg.includes("class=\"mermaid-error")) return true;
  return false;
}

/**
 * Clean up any residual DOM elements created by mermaid.render().
 * Mermaid v11 inserts a temporary SVG element with the given id into the document.
 * If the component unmounts before render completes, these elements are left behind.
 */
function cleanupMermaidDom(id: string): void {
  try {
    const el = document.getElementById(id);
    if (el) el.remove();
    // Mermaid v11 also creates a container with id "d" + id
    const container = document.getElementById('d' + id);
    if (container) container.remove();
  } catch {
    // Ignore DOM cleanup errors
  }
}

/**
 * Render with abort support - allows cancelling stale requests
 */
async function renderWithAbort(
  code: string,
  id: string,
  signal: AbortSignal
): Promise<{ svg: string; bindFunctions?: (element: Element) => void } | null> {
  if (!mermaidInstance) return null;

  try {
    if (signal.aborted) return null;
    await mermaidInstance.parse(code);
    if (signal.aborted) {
      cleanupMermaidDom(id);
      return null;
    }
    const result = await mermaidInstance.render(id, code);
    if (signal.aborted) {
      cleanupMermaidDom(id);
      return null;
    }
    return result;
  } catch {
    cleanupMermaidDom(id);
    return null;
  }
}

/**
 * Custom hook for independent zoom/pan state management.
 * Each view (inline / fullscreen) gets its own state.
 */
function useViewTransform(
  svgContainerRef: React.RefObject<HTMLDivElement | null>,
  contentAreaRef: React.RefObject<HTMLDivElement | null>,
  displaySvg: string,
) {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const dragStartRef = useRef({ x: 0, y: 0 });
  const panStartRef = useRef({ x: 0, y: 0 });
  const hasUserInteractedRef = useRef(false);

  const handleZoomIn = useCallback(() => {
    hasUserInteractedRef.current = true;
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  }, []);

  const handleZoomOut = useCallback(() => {
    hasUserInteractedRef.current = true;
    setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  }, []);

  const applyFitZoom = useCallback(() => {
    if (!svgContainerRef.current || !contentAreaRef.current) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const svgElement = svgContainerRef.current.querySelector('svg');
    if (!svgElement) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const containerRect = contentAreaRef.current.getBoundingClientRect();
    const padding = 32;
    const availableWidth = containerRect.width - padding;
    const availableHeight = containerRect.height - padding;

    const svgWidth = parseFloat(svgElement.getAttribute('width') || '0') || svgElement.viewBox?.baseVal?.width || svgElement.getBoundingClientRect().width;
    const svgHeight = parseFloat(svgElement.getAttribute('height') || '0') || svgElement.viewBox?.baseVal?.height || svgElement.getBoundingClientRect().height;

    if (!svgWidth || !svgHeight) {
      setZoom(1);
      setPan({ x: 0, y: 0 });
      return;
    }

    const scaleX = availableWidth / svgWidth;
    const scaleY = availableHeight / svgHeight;
    const scale = Math.min(scaleX, scaleY, 1);
    const finalZoom = Math.max(MIN_ZOOM, Math.min(scale, MAX_ZOOM));

    setZoom(finalZoom);
    setPan({ x: 0, y: 0 });
  }, [svgContainerRef, contentAreaRef]);

  // Auto-fit when SVG changes (only if user hasn't manually interacted)
  useEffect(() => {
    if (!displaySvg) return;
    if (hasUserInteractedRef.current) return;

    const frameId = requestAnimationFrame(() => {
      applyFitZoom();
    });

    return () => cancelAnimationFrame(frameId);
  }, [displaySvg, applyFitZoom]);

  const handleFit = useCallback(() => {
    hasUserInteractedRef.current = false;
    applyFitZoom();
  }, [applyFitZoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('a, button, [role="button"]')) return;

    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
    e.preventDefault();
  }, [pan]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;

    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;

    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) {
      hasUserInteractedRef.current = true;
    }

    setPan({
      x: panStartRef.current.x + dx,
      y: panStartRef.current.y + dy,
    });
  }, [isDragging]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  // Global mouse up for drag release outside container
  useEffect(() => {
    if (!isDragging) return;

    const handleGlobalMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  const reset = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setIsDragging(false);
    hasUserInteractedRef.current = false;
  }, []);

  return {
    zoom,
    pan,
    isDragging,
    handleZoomIn,
    handleZoomOut,
    handleFit,
    applyFitZoom,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleMouseLeave,
    reset,
  };
}

export const MermaidRenderer = React.memo<MermaidRendererProps>(({
  children,
  isStreaming: externalIsStreaming = false,
  options = {},
}) => {
  const { theme = 'default' } = options;

  // ============================================================================
  // React 18 Concurrent Features
  // ============================================================================
  const [isPending, startTransition] = useTransition();

  // ============================================================================
  // Rendering State (Core - must be stable)
  // ============================================================================
  const [displaySvg, setDisplaySvg] = useState<string>('');
  const [isReady, setIsReady] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

  // ============================================================================
  // UI State
  // ============================================================================
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isCodeOpen, setIsCodeOpen] = useState(false);

  // ============================================================================
  // Refs
  // ============================================================================
  const containerRef = useRef<HTMLDivElement>(null);
  const svgContainerRef = useRef<HTMLDivElement>(null);
  const contentAreaRef = useRef<HTMLDivElement>(null);
  const fsContainerRef = useRef<HTMLDivElement>(null);
  const fsSvgContainerRef = useRef<HTMLDivElement>(null);
  const fsContentAreaRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const lastRenderIdRef = useRef<string>('');
  const lastValidSvgRef = useRef<string>('');
  const lastValidCodeRef = useRef<string>('');
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRenderTimeRef = useRef<number>(0);

  // ============================================================================
  // Independent View Transform States
  // ============================================================================
  const inline = useViewTransform(svgContainerRef, contentAreaRef, displaySvg);
  const fullscreen = useViewTransform(fsSvgContainerRef, fsContentAreaRef, displaySvg);

  // ============================================================================
  // Code Processing
  // ============================================================================
  const rawMermaidCode = useMemo(() => extractMermaidCode(children), [children]);
  const contentHash = useMemo(() => hashContent(rawMermaidCode), [rawMermaidCode]);
  const deferredMermaidCode = useDeferredValue(rawMermaidCode);
  // Streaming: use raw value directly for fastest response
  // Non-streaming: use deferred value to avoid blocking text rendering
  const mermaidCode = isStreaming ? rawMermaidCode : deferredMermaidCode;

  // ============================================================================
  // Journey Chart Offset Compensation (inline only)
  // ============================================================================
  const journeyOffset = useMemo<{ x: number; y: number }>(() => {
    const chartType = detectChartType(rawMermaidCode);
    if (chartType !== 'journey') return { x: 0, y: 0 };

    const viewBoxMatch = (displaySvg || '').match(/viewBox="([^"]+)"/);
    if (!viewBoxMatch) return { x: 0, y: 0 };

    const parts = viewBoxMatch[1].split(/\s+/).map(Number);
    if (parts.length !== 4) return { x: 0, y: 0 };

    const [vbX, vbY, vbW] = parts;
    return {
      x: vbX < 0 ? -vbX : vbW * -0.11,
      y: vbY < 0 ? -vbY * 0.5 : 0,
    };
  }, [rawMermaidCode, displaySvg]);

  // ============================================================================
  // Initialize Mermaid
  // ============================================================================
  useEffect(() => {
    initMermaid(theme).then(() => setIsReady(true));
  }, [theme]);

  // ============================================================================
  // Streaming State Detection
  // ============================================================================
  useEffect(() => {
    if (externalIsStreaming) {
      setIsStreaming(true);
      if (streamEndTimerRef.current) clearTimeout(streamEndTimerRef.current);
    } else {
      streamEndTimerRef.current = setTimeout(() => {
        setIsStreaming(false);
      }, STREAMING_END_DELAY_MS);
    }

    return () => {
      if (streamEndTimerRef.current) clearTimeout(streamEndTimerRef.current);
    };
  }, [children, externalIsStreaming]);

  // ============================================================================
  // Core Render Logic (UNCHANGED - critical for stability)
  // ============================================================================
  const attemptRender = useCallback(
    async (code: string) => {
      if (!isReady || !code.trim()) return;
      if (code === lastValidCodeRef.current) return;

      // Check cache for non-streaming
      if (!isStreaming) {
        const cached = svgCacheGet(contentHash);
        if (cached) {
          startTransition(() => {
            setDisplaySvg(cached);
          });
          lastValidSvgRef.current = cached;
          lastValidCodeRef.current = code;
          return;
        }
      } else {
        // Streaming: skip cache, always render latest
      }

      // Cancel previous render
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      const renderStart = performance.now();
      const id = `mermaid-${contentHash}-${Date.now()}`;
      lastRenderIdRef.current = id;
      const result = await renderWithAbort(code, id, abortController.signal);
      const renderTime = performance.now() - renderStart;
      lastRenderTimeRef.current = renderTime;

      if (!result || abortController.signal.aborted) {
        logMermaid('Render aborted or failed:', contentHash.substring(0, 6));
        return;
      }

      const { svg, bindFunctions } = result;

      // Discard SVG that contains any Mermaid error messages — keep previous valid SVG
      if (isErrorSvg(svg)) {
        logMermaid('Rendered SVG contains error, discarded:', contentHash.substring(0, 6));
        return;
      }

      // Streaming: direct update for fastest response
      // Non-streaming: useTransition to avoid blocking user interactions
      if (isStreaming) {
        setDisplaySvg(svg);
      } else {
        startTransition(() => {
          setDisplaySvg(svg);
        });
      }

      lastValidSvgRef.current = svg;
      lastValidCodeRef.current = code;

      if (!isStreaming) {
        svgCacheSet(contentHash, svg);
      }

      if (bindFunctions) {
        // 根据 fullscreen 状态选择正确的容器绑定交互事件
        const targetContainer = isFullscreen ? fsContainerRef.current : containerRef.current;
        if (targetContainer) {
          bindFunctions(targetContainer);
        }
      }

      logMermaid('Rendered:', contentHash.substring(0, 6));
    },
    [isReady, isStreaming, contentHash, startTransition]
  );

  // ============================================================================
  // Render Trigger
  // ============================================================================
  const triggerRender = useCallback(
    (code: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      if (isStreaming) {
        // Adaptive debounce: wait for previous render to finish, then a small gap
        // If no previous render, use minimal 16ms (~1 frame) to batch rapid SSE chunks
        const lastTime = lastRenderTimeRef.current;
        const adaptiveDelay = lastTime > 0
          ? Math.max(16, Math.min(lastTime * 0.5, 150))
          : 16;

        debounceTimerRef.current = setTimeout(() => {
          attemptRender(code);
        }, adaptiveDelay);
      } else {
        // Non-streaming: render immediately (no debounce)
        attemptRender(code);
      }
    },
    [attemptRender, isStreaming]
  );

  useEffect(() => {
    if (!isReady) return;
    triggerRender(mermaidCode);
  }, [mermaidCode, isReady, triggerRender]);

  // 确保流式结束时触发最终渲染（非流式缓存路径）
  useEffect(() => {
    if (!isStreaming && isReady && mermaidCode !== lastValidCodeRef.current) {
      attemptRender(mermaidCode);
    }
  }, [isStreaming, isReady, mermaidCode, attemptRender]);

  // ============================================================================
  // Fullscreen Toggle — resets fullscreen state on open
  // ============================================================================
  const handleFullscreenToggle = useCallback(() => {
    setIsFullscreen((prev) => {
      if (!prev) {
        // Opening: reset fullscreen transform state
        fullscreen.reset();
        // Auto-fit after mount (next frame)
        requestAnimationFrame(() => {
          fullscreen.applyFitZoom();
        });
      }
      return !prev;
    });
  }, [fullscreen]);

  const handleCodeToggle = useCallback(() => {
    setIsCodeOpen((o) => !o);
  }, []);

  // ============================================================================
  // Cleanup
  // ============================================================================
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      if (streamEndTimerRef.current) clearTimeout(streamEndTimerRef.current);
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      // Clean up any residual DOM elements created by mermaid.render()
      if (lastRenderIdRef.current) {
        cleanupMermaidDom(lastRenderIdRef.current);
      }
    };
  }, []);

  // ============================================================================
  // Render
  // ============================================================================
  const currentSvg = displaySvg || lastValidSvgRef.current;

  // Shared loading indicator
  const loadingIndicator = isPending && isStreaming && (
    <div className="remar-mermaid-loading-indicator">
      <span className="remar-mermaid-loading-dot" />
      <span className="remar-mermaid-loading-dot" />
      <span className="remar-mermaid-loading-dot" />
    </div>
  );

  // Fullscreen content (independent transform state)
  const fullscreenContent = (
    <div
      ref={fsContainerRef}
      className="remar-mermaid-wrapper remar-mermaid-wrapper--fullscreen"
    >
      <MermaidToolbar
        svgContent={currentSvg}
        mermaidCode={mermaidCode}
        zoom={fullscreen.zoom}
        isFullscreen={true}
        isCodeOpen={isCodeOpen}
        onZoomIn={fullscreen.handleZoomIn}
        onZoomOut={fullscreen.handleZoomOut}
        onFit={fullscreen.handleFit}
        onFullscreenToggle={handleFullscreenToggle}
        onCodeToggle={handleCodeToggle}
      />

      <div
        ref={fsContentAreaRef}
        className="remar-mermaid-content remar-mermaid-content--fullscreen"
        onMouseDown={!isCodeOpen ? fullscreen.handleMouseDown : undefined}
        onMouseMove={!isCodeOpen ? fullscreen.handleMouseMove : undefined}
        onMouseUp={!isCodeOpen ? fullscreen.handleMouseUp : undefined}
        onMouseLeave={!isCodeOpen ? fullscreen.handleMouseLeave : undefined}
        style={{ cursor: isCodeOpen ? 'default' : (fullscreen.isDragging ? 'grabbing' : 'grab') }}
      >
        {isCodeOpen ? (
          <MermaidCodePanel
            code={mermaidCode}
            isOpen={true}
            isFullView={true}
          />
        ) : (
          <div
            ref={fsSvgContainerRef}
            className={`remar-mermaid-svg-container ${isPending ? 'updating' : ''} ${fullscreen.isDragging ? 'dragging' : ''}`}
            style={{
              transform: `translate(${fullscreen.pan.x}px, ${fullscreen.pan.y}px) scale(${fullscreen.zoom})`,
              transformOrigin: 'center center',
            }}
            dangerouslySetInnerHTML={{ __html: currentSvg }}
          />
        )}
      </div>

      {loadingIndicator}
    </div>
  );

  return (
    <>
      {/* Inline (chat) rendering */}
      <div
        ref={containerRef}
        className="remar-mermaid-wrapper"
      >
        <MermaidToolbar
          svgContent={currentSvg}
          mermaidCode={mermaidCode}
          zoom={inline.zoom}
          isFullscreen={false}
          isCodeOpen={isCodeOpen}
          onZoomIn={inline.handleZoomIn}
          onZoomOut={inline.handleZoomOut}
          onFit={inline.handleFit}
          onFullscreenToggle={handleFullscreenToggle}
          onCodeToggle={handleCodeToggle}
        />

        <div
          ref={contentAreaRef}
          className="remar-mermaid-content"
          onMouseDown={!isCodeOpen ? inline.handleMouseDown : undefined}
          onMouseMove={!isCodeOpen ? inline.handleMouseMove : undefined}
          onMouseUp={!isCodeOpen ? inline.handleMouseUp : undefined}
          onMouseLeave={!isCodeOpen ? inline.handleMouseLeave : undefined}
          style={{ cursor: isCodeOpen ? 'default' : (inline.isDragging ? 'grabbing' : 'grab') }}
        >
          {isCodeOpen ? (
            <MermaidCodePanel
              code={mermaidCode}
              isOpen={true}
              isFullView={false}
            />
          ) : (
            <div
              ref={svgContainerRef}
              className={`remar-mermaid-svg-container ${isPending ? 'updating' : ''} ${inline.isDragging ? 'dragging' : ''}`}
              style={{
                transform: `translate(${inline.pan.x + journeyOffset.x / inline.zoom}px, ${inline.pan.y + journeyOffset.y / inline.zoom}px) scale(${inline.zoom})`,
                transformOrigin: 'center center',
              }}
              dangerouslySetInnerHTML={{ __html: currentSvg }}
            />
          )}
        </div>

        {loadingIndicator}
      </div>

      {/* Fullscreen overlay via Portal (independent transform state) */}
      <Fullscreenable
        open={isFullscreen}
        onClose={handleFullscreenToggle}
        ariaLabel="Fullscreen diagram preview"
        closeOnBackdropClick={true}
        closeOnEsc={true}
        animate={true}
      >
        {fullscreenContent}
      </Fullscreenable>
    </>
  );
});

MermaidRenderer.displayName = 'MermaidRenderer';

export default MermaidRenderer;
