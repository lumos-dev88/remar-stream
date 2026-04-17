'use client';

import React, { memo, useEffect, useMemo, useState } from 'react';
import type { ThemedToken } from '@shikijs/core';
import { getShikiHighlighter, resolveLanguage } from './highlighter';
import { useShikiWorker } from './useShikiWorker';
import type { ShikiWorkerResult } from './useShikiWorker';

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

const ShikiLine = memo<ShikiLineProps>(({ tokens }) => {
  if (tokens.length === 0) return null;

  return (
    <>
      {tokens.map((token, tokenIndex) => (
        <ShikiToken key={tokenIndex} token={token} />
      ))}
    </>
  );
}, (prev, next) => {
  // 自定义比较：按 token 内容和偏移量比较，避免数组引用变化导致无效重渲染
  if (prev.tokens.length !== next.tokens.length) return false;
  return prev.tokens.every((t, i) =>
    t.content === next.tokens[i].content &&
    t.offset === next.tokens[i].offset &&
    t.htmlStyle === next.tokens[i].htmlStyle,
  );
});

ShikiLine.displayName = 'ShikiLine';

// ─── Token component ──────────────────────────────────────────────────

interface ShikiTokenProps {
  token: ThemedToken;
}

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
 * Rendering strategy:
 * 1. Try Web Worker first (non-blocking, best INP)
 * 2. Fallback to main-thread highlighter (if Worker unavailable)
 *
 * Architecture:
 * - Full re-run: codeToTokens(full code) on every update
 * - Line-level memo: ShikiLine skips re-render for unchanged lines
 * - Streaming: only render stable lines (up to last `\n`)
 * - Final correction: when streaming ends, render all lines
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
  const { highlight: highlightInWorker } = useShikiWorker();

  // Handle highlight result (from Worker or main-thread)
  const handleResult = useMemo(() => (result: ShikiWorkerResult | null) => {
    if (!result) {
      setTokens(null);
      setRootColors(null);
      return;
    }
    setTokens(result.tokens as ThemedToken[][]);
    setRootColors({ fg: result.fg, bg: result.bg });
  }, []);

  // Highlight on code change
  useEffect(() => {
    if (!code) {
      handleResult(null);
      return;
    }

    let cancelled = false;
    const currentCode = code;
    const currentLang = lang;

    // Strategy: try Worker first, fallback to main-thread
    highlightInWorker({
      code: currentCode,
      lang: currentLang,
      callback: (result) => {
        if (cancelled) return;

        // Worker returned empty tokens — means Worker failed or language not loaded
        // Fall back to main-thread
        if (result.tokens.length === 0 && currentCode) {
          fallbackHighlight(currentCode, currentLang).then((mainResult) => {
            if (cancelled) return;
            handleResult(mainResult);
          });
          return;
        }

        handleResult(result);
      },
    });

    return () => { cancelled = true; };
  }, [code, lang, highlightInWorker, handleResult]);

  // Build root style from shiki's fg/bg
  const preStyle = useMemo((): React.CSSProperties | undefined => {
    if (!rootColors) return undefined;
    const style: Record<string, string> = {};
    if (rootColors.fg) style.color = `var(${rootColors.fg.split(';')[0].split(':')[0]})`;
    if (rootColors.bg) style.backgroundColor = `var(${rootColors.bg.split(';')[0].split(':')[0]})`;
    return style as React.CSSProperties;
  }, [rootColors]);

  // Determine which lines to render
  const renderableLines = useMemo(() => {
    if (!tokens || tokens.length === 0) return { lines: tokens as ThemedToken[][], hasIncomplete: false };

    if (!isStreaming) {
      return { lines: tokens, hasIncomplete: false };
    }

    if (code.endsWith('\n')) {
      return { lines: tokens, hasIncomplete: false };
    }

    const stableLines = tokens.slice(0, -1);
    return { lines: stableLines, hasIncomplete: true };
  }, [tokens, isStreaming, code]);

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

// ─── Fallback: Main-thread highlighter ───────────────────────────────

async function fallbackHighlight(
  code: string,
  lang: string,
): Promise<ShikiWorkerResult | null> {
  try {
    const highlighter = await getShikiHighlighter();

    if (!highlighter.getLoadedLanguages().includes(lang)) {
      try {
        await highlighter.loadLanguage(lang);
      } catch {
        return null;
      }
    }

    const result = highlighter.codeToTokens(code, {
      lang,
      themes: { light: 'remar-light', dark: 'remar-dark' },
      defaultColor: false,
    });

    return {
      tokens: result.tokens as any,
      fg: result.fg,
      bg: result.bg,
    };
  } catch {
    return null;
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────

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
