'use client';

import React, { memo, useEffect, useMemo, useState } from 'react';
import type { ThemedToken } from '@shikijs/core';
import { getShikiHighlighter, resolveLanguage } from './highlighter';

export interface HighlightedBodyProps {
  code: string;
  language: string;
  isStreaming?: boolean;
  className?: string;
}

// ─── Line-level memoized component ────────────────────────────────────

interface ShikiLineProps {
  tokens: ThemedToken[];
}

/**
 * Single line of highlighted tokens.
 * Memoized — skips re-render if tokens array reference hasn't changed.
 */
const ShikiLine = memo<ShikiLineProps>(({ tokens }) => {
  if (tokens.length === 0) return null;

  return (
    <>
      {tokens.map((token, tokenIndex) => (
        <ShikiToken key={tokenIndex} token={token} />
      ))}
    </>
  );
});

ShikiLine.displayName = 'ShikiLine';

// ─── Token component ──────────────────────────────────────────────────

interface ShikiTokenProps {
  token: ThemedToken;
}

/**
 * Single syntax token with inline style.
 * Maps shiki's htmlStyle to direct CSS properties.
 */
const ShikiToken = memo<ShikiTokenProps>(({ token }) => {
  const style = useMemo(() => buildTokenStyle(token), [token.htmlStyle, token.content]);
  const hasStyle = Object.keys(style).length > 0;

  return (
    <span style={hasStyle ? style : undefined}>
      {token.content}
    </span>
  );
});

ShikiToken.displayName = 'ShikiToken';

// ─── Main component ───────────────────────────────────────────────────

/**
 * HighlightedCodeBody - Shiki-powered syntax highlighting
 *
 * Architecture (inspired by shiki-stream):
 * - Full re-run: codeToTokens(full code) on every update
 * - Line-level memo: ShikiLine skips re-render for unchanged lines
 * - Streaming: only render stable lines (up to last `\n`)
 * - Final correction: when streaming ends, render all lines
 *
 * CSS strategy:
 * - Light theme: direct inline `color` / `background-color`
 * - Dark theme: `--shiki-dark` / `--shiki-dark-bg` CSS variables,
 *   overridden by [data-theme='dark'] selector in SCSS
 */
export const HighlightedCodeBody: React.FC<HighlightedBodyProps> = memo(({
  code,
  language,
  isStreaming = false,
  className,
}) => {
  const [tokens, setTokens] = useState<ThemedToken[][] | null>(null);
  const [rootColors, setRootColors] = useState<{ fg: string; bg: string } | null>(null);
  const lang = useMemo(() => resolveLanguage(language), [language]);

  // Single effect: init highlighter + highlight on code change
  useEffect(() => {
    if (!code) {
      setTokens(null);
      setRootColors(null);
      return;
    }

    let cancelled = false;
    const currentCode = code;
    const currentLang = lang;

    getShikiHighlighter().then(async (highlighter) => {
      if (cancelled) return;

      // Ensure language is loaded
      if (!highlighter.getLoadedLanguages().includes(currentLang)) {
        try {
          await highlighter.loadLanguage(currentLang);
        } catch {
          // Language not available, show raw code
          if (!cancelled) {
            setTokens(null);
            setRootColors(null);
          }
          return;
        }
      }

      if (cancelled) return;

      // Highlight (dual-theme, CSS variables, no default color)
      const result = highlighter.codeToTokens(currentCode, {
        lang: currentLang,
        themes: { light: 'remar-light', dark: 'remar-dark' },
        defaultColor: false,
      });

      if (!cancelled) {
        setTokens(result.tokens);
        setRootColors({ fg: result.fg, bg: result.bg });
      }
    });

    return () => { cancelled = true; };
  }, [code, lang]);

  // Build root style from shiki's fg/bg (CSS variable format with defaultColor: false)
  // fg: "--shiki-light:#24292e;--shiki-dark:#e1e4e8"
  // bg: "--shiki-light-bg:#fff;--shiki-dark-bg:#24292e"
  const preStyle = useMemo((): React.CSSProperties | undefined => {
    if (!rootColors) return undefined;
    const style: Record<string, string> = {};
    if (rootColors.fg) style.color = `var(${rootColors.fg.split(';')[0].split(':')[0]})`;
    if (rootColors.bg) style.backgroundColor = `var(${rootColors.bg.split(';')[0].split(':')[0]})`;
    return style as React.CSSProperties;
  }, [rootColors]);

  // Determine which lines to render
  // Streaming: only render up to the last complete line (ends with \n)
  // Static: render all lines (final correction for cross-line scope)
  const renderableLines = useMemo(() => {
    if (!tokens || tokens.length === 0) return { lines: tokens as ThemedToken[][], hasIncomplete: false };

    if (!isStreaming) {
      return { lines: tokens, hasIncomplete: false };
    }

    // If code ends with \n, all lines are stable
    if (code.endsWith('\n')) {
      return { lines: tokens, hasIncomplete: false };
    }

    // Last line is incomplete — exclude from highlighted rendering
    const stableLines = tokens.slice(0, -1);
    return { lines: stableLines, hasIncomplete: true };
  }, [tokens, isStreaming, code]);

  // No tokens yet (highlighter loading or empty code)
  if (!tokens) {
    return (
      <pre className={`remar-shiki ${className || ''}`} style={preStyle}>
        <code>{escapeHtml(code)}</code>
      </pre>
    );
  }

  const preClassName = `remar-shiki ${className || ''}`;

  return (
    <pre className={preClassName} style={preStyle}>
      <code>
        {renderableLines.lines.map((line, lineIndex) => (
          <span className="remar-shiki-line" key={lineIndex}>
            <ShikiLine tokens={line} />
            {lineIndex < renderableLines.lines.length - 1 ? '\n' : null}
          </span>
        ))}
        {/* Incomplete last line during streaming: still highlight but mark as unstable */}
        {renderableLines.hasIncomplete && tokens.length > 0 && (
          <span className="remar-shiki-line remar-shiki-line-incomplete">
            <ShikiLine tokens={tokens[tokens.length - 1]} />
          </span>
        )}
      </code>
    </pre>
  );
});

HighlightedCodeBody.displayName = 'HighlightedCodeBody';

// ─── Helpers ──────────────────────────────────────────────────────────

/**
 * Build inline style from a shiki token.
 *
 * With defaultColor: false, htmlStyle contains only CSS variables:
 *   { "--shiki-light": "#ff3b30", "--shiki-dark": "#f87171" }
 *
 * Theme switching is handled by CSS:
 *   .remar-shiki span { color: var(--shiki-light); }
 *   [data-theme='dark'] .remar-shiki span { color: var(--shiki-dark) !important; }
 */
function buildTokenStyle(token: ThemedToken): Record<string, string> {
  const style: Record<string, string> = {};

  if (token.htmlStyle) {
    for (const [key, value] of Object.entries(token.htmlStyle)) {
      style[key] = value;
    }
  }

  return style;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default HighlightedCodeBody;
