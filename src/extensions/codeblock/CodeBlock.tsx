'use client';

import React, { lazy, memo, Suspense, useCallback, useMemo, useState } from 'react';
import { CodeBlockHeader } from './CodeBlockHeader';
import type { CodeBlockProps } from './types';

// Lazy-load the Shiki-powered highlighter (code-split, non-blocking)
const HighlightedCodeBody = lazy(() =>
  import('./highlighted-body').then((mod) => ({
    default: mod.HighlightedCodeBody,
  })),
);

/**
 * CodeBlock - Code block component
 *
 * Architecture:
 * - Lazy + Suspense: Shiki highlighter loaded asynchronously
 * - Fallback: Raw code displayed immediately (no FOUC)
 * - Dual-theme: CSS variables for light/dark mode
 * - Streaming: isStreaming controls opacity transition
 */
export const CodeBlock = memo<CodeBlockProps>(({
  code,
  language = 'text',
  isStreaming = false,
}) => {
  const [copied, setCopied] = useState(false);

  // Handle code blocks during streaming
  const safeCode = useMemo(() => {
    if (!code || code === 'undefined') return '';
    return code;
  }, [code]);

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(safeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const el = document.createElement('textarea');
      el.value = safeCode;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [safeCode]);

  const codeClassName = `remar-codeblock-code ${isStreaming ? 'remar-codeblock-streaming' : 'remar-codeblock-ready'}`;

  return (
    <div className="remar-codeblock-container" data-language={language}>
      <CodeBlockHeader
        language={language}
        code={safeCode}
        copied={copied}
        onCopy={handleCopy}
      />
      <div className="remar-codeblock-content">
        <Suspense
          fallback={
            <pre className="remar-codeblock-pre">
              <code className={codeClassName}>
                {safeCode ? escapeHtml(safeCode) : null}
              </code>
            </pre>
          }
        >
          {safeCode ? (
            <HighlightedCodeBody
              code={safeCode}
              language={language}
              isStreaming={isStreaming}
              className="remar-codeblock-pre"
            />
          ) : (
            <pre className="remar-codeblock-pre">
              <code className="remar-codeblock-code remar-codeblock-empty">
                {isStreaming && <span className="remar-codeblock-placeholder">// Loading code...</span>}
              </code>
            </pre>
          )}
        </Suspense>
      </div>
    </div>
  );
});

CodeBlock.displayName = 'CodeBlock';

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default CodeBlock;
