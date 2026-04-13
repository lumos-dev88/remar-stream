'use client';

import React, { useCallback, useState, useMemo } from 'react';
import Prism from 'prismjs';
import { CodeBlockHeader } from './CodeBlockHeader';
import type { CodeBlockProps } from './types';

// Import common language support
import 'prismjs/components/prism-javascript';
import 'prismjs/components/prism-typescript';
import 'prismjs/components/prism-jsx';
import 'prismjs/components/prism-tsx';
import 'prismjs/components/prism-python';
import 'prismjs/components/prism-go';
import 'prismjs/components/prism-bash';
import 'prismjs/components/prism-json';
import 'prismjs/components/prism-css';
import 'prismjs/components/prism-sql';
import 'prismjs/components/prism-yaml';
import 'prismjs/components/prism-markdown';
import 'prismjs/components/prism-rust';
import 'prismjs/components/prism-java';

// Language mapping table
const languageMap: Record<string, string> = {
  'js': 'javascript',
  'ts': 'typescript',
  'py': 'python',
  'sh': 'bash',
  'shell': 'bash',
  'yml': 'yaml',
  'md': 'markdown',
  'rs': 'rust',
};

/**
 * CodeBlock - Code block component
 *
 * Core Design:
 * - All code blocks display highlighted code
 * - Mermaid is handled directly by SimpleStreamMermaid in MarkdownRenderer
 */
export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'text',
  isStreaming = false,
}) => {
  const [copied, setCopied] = useState(false);

  // Handle code blocks during streaming
  // When code is undefined, null, or 'undefined' string, display as empty
  const safeCode = useMemo(() => {
    if (!code || code === 'undefined') return '';
    return code;
  }, [code]);

  // Synchronously highlight code
  const highlightedCode = useMemo(() => {
    if (!safeCode) return '';

    const mappedLang = languageMap[language] || language;
    const grammar = Prism.languages[mappedLang] || Prism.languages.plain;

    try {
      return Prism.highlight(safeCode, grammar, mappedLang);
    } catch {
      // Return raw code when highlighting fails (HTML escaped)
      return safeCode
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    }
  }, [safeCode, language]);

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

  return (
    <div className="remar-codeblock-container" data-language={language}>
      <CodeBlockHeader
        language={language}
        code={safeCode}
        copied={copied}
        onCopy={handleCopy}
      />
      <div className="remar-codeblock-content">
        <pre className="remar-codeblock-pre">
          {safeCode ? (
            <code
              className={`remar-codeblock-code ${isStreaming ? 'remar-codeblock-streaming' : 'remar-codeblock-ready'}`}
              dangerouslySetInnerHTML={{ __html: highlightedCode }}
            />
          ) : (
            <code className="remar-codeblock-code remar-codeblock-empty">
              {isStreaming && <span className="remar-codeblock-placeholder">// Loading code...</span>}
            </code>
          )}
        </pre>
      </div>
    </div>
  );
};

export default CodeBlock;
