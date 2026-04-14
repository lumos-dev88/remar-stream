'use client';

import React from 'react';
import { Check, Copy } from 'lucide-react';
import type { CodeBlockHeaderProps } from './types';

/**
 * Code block header component
 * Displays language label and copy button
 */
export const CodeBlockHeader: React.FC<CodeBlockHeaderProps> = ({
  language,
  copied,
  onCopy
}) => {
  const displayLanguage = language === 'text' || !language ? 'plaintext' : language;

  return (
    <div className="remar-codeblock-header">
      <span className="remar-codeblock-language">{displayLanguage}</span>
      <div className="remar-codeblock-actions">
        <button
          type="button"
          className="remar-codeblock-action-btn"
          onClick={onCopy}
        >
          {copied ? <Check size={16} /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  );
};
