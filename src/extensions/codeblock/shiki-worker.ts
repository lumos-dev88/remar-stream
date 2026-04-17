/**
 * Shiki Web Worker
 *
 * Runs shiki highlighter in a dedicated Worker thread.
 * Communicates with the main thread via structured message protocol.
 *
 * Protocol:
 *   Main → Worker: { type: 'highlight', id: string, code: string, lang: string }
 *   Worker → Main: { type: 'highlight:result', id: string, tokens: ThemedToken[][], fg: string, bg: string }
 *   Worker → Main: { type: 'highlight:error', id: string, error: string }
 *   Main → Worker: { type: 'load-language', lang: string }
 *   Worker → Main: { type: 'load-language:result', lang: string, ok: boolean }
 */

import { createHighlighter, createJavaScriptRegexEngine } from 'shiki';
import type { HighlighterCore, ThemedToken } from '@shikijs/core';
import { remarLightTheme, remarDarkTheme } from './theme';

// ─── Highlighter Singleton (Worker-scoped) ────────────────────────────

const BUNDLED_LANGS = [
  'javascript', 'typescript', 'jsx', 'tsx',
  'python', 'go', 'bash', 'json', 'css', 'sql', 'yaml',
  'markdown', 'rust', 'java', 'plaintext',
] as const;

const languageMap: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python',
  sh: 'bash', shell: 'bash', yml: 'yaml',
  md: 'markdown', rs: 'rust',
};

let highlighter: HighlighterCore | null = null;
let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (highlighter) return Promise.resolve(highlighter);
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      engine: createJavaScriptRegexEngine(),
      langs: [...new Set(BUNDLED_LANGS)],
      themes: [remarLightTheme, remarDarkTheme],
    }).then((h) => {
      highlighter = h;
      return h;
    });
  }
  return highlighterPromise;
}

function resolveLanguage(lang: string): string {
  return languageMap[lang] || lang || 'plaintext';
}

// ─── Message Handler ──────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  // Ping-pong: signal readiness to main thread
  if (msg.type === 'ping') {
    self.postMessage({ type: 'pong' });
    return;
  }

  if (msg.type === 'highlight') {
    const { id, code, lang } = msg;
    try {
      const h = await getHighlighter();
      const resolvedLang = resolveLanguage(lang);

      // Ensure language is loaded
      if (!h.getLoadedLanguages().includes(resolvedLang)) {
        try {
          await h.loadLanguage(resolvedLang as any);
        } catch {
          // Language not available, return empty result
          self.postMessage({ type: 'highlight:result', id, tokens: [], fg: '', bg: '' });
          return;
        }
      }

      const result = h.codeToTokens(code, {
        lang: resolvedLang,
        themes: { light: 'remar-light', dark: 'remar-dark' },
        defaultColor: false,
      });

      // Serialize tokens to plain objects (structured clone can't transfer class instances)
      const serializedTokens = result.tokens.map((line) =>
        line.map((token: ThemedToken) => ({
          content: token.content,
          offset: token.offset,
          htmlStyle: token.htmlStyle ? { ...token.htmlStyle } : undefined,
        })),
      );

      self.postMessage({
        type: 'highlight:result',
        id,
        tokens: serializedTokens,
        fg: result.fg,
        bg: result.bg,
      });
    } catch (err: any) {
      self.postMessage({ type: 'highlight:error', id, error: err.message || String(err) });
    }
  }

  if (msg.type === 'load-language') {
    const { lang } = msg;
    try {
      const h = await getHighlighter();
      const resolvedLang = resolveLanguage(lang);
      if (!h.getLoadedLanguages().includes(resolvedLang)) {
        await h.loadLanguage(resolvedLang as any);
      }
      self.postMessage({ type: 'load-language:result', lang, ok: true });
    } catch {
      self.postMessage({ type: 'load-language:result', lang, ok: false });
    }
  }
};
