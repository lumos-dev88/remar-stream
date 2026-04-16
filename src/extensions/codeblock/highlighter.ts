/**
 * Shiki Highlighter Singleton
 *
 * Lazy-initializes a shared shiki highlighter instance.
 * Uses Remar custom themes (light + dark) with defaultColor: false.
 *
 * Token output format (CSS variables, no default color):
 *   style="--shiki-light:#ff3b30;--shiki-dark:#f87171"
 *
 * Theme switching via CSS:
 *   [data-theme='dark'] .remar-shiki span { color: var(--shiki-dark) !important; }
 */

import type { HighlighterCore } from '@shikijs/core';
import { remarLightTheme, remarDarkTheme } from './theme';

let highlighterPromise: Promise<HighlighterCore> | null = null;

const BUNDLED_LANGS = [
  'javascript', 'typescript', 'jsx', 'tsx',
  'python', 'go', 'bash', 'json', 'css', 'sql', 'yaml',
  'markdown', 'rust', 'java', 'plaintext',
] as const;

export const languageMap: Record<string, string> = {
  js: 'javascript', ts: 'typescript', py: 'python',
  sh: 'bash', shell: 'bash', yml: 'yaml',
  md: 'markdown', rs: 'rust',
};

export function getShikiHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki').then(({ createHighlighter, createJavaScriptRegexEngine }) =>
      createHighlighter({
        engine: createJavaScriptRegexEngine(),
        langs: [...new Set(BUNDLED_LANGS)],
        themes: [remarLightTheme, remarDarkTheme],
      }),
    );
  }
  return highlighterPromise;
}

export function resolveLanguage(lang: string): string {
  return languageMap[lang] || lang || 'plaintext';
}
