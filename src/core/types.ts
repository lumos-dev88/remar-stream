import React from 'react';

/**
 * Block content type
 * - Standard markdown types: 'paragraph', 'heading', 'code', etc.
 * - Plugin-specific types: 'mermaid', 'math-block', etc.
 */
export type BlockContentType =
  | 'paragraph'
  | 'heading'
  | 'code'
  | 'mermaid'
  | 'math-block'
  | 'list'
  | 'blockquote'
  | 'table'
  | 'html'
  | 'space'
  | string;  // Extensible for custom plugins

export interface BlockInfo {
  content: string;
  key?: string;
  startOffset: number;  // Content offset in the overall document, used for generating stable keys
  blockType?: BlockContentType;  // Resolved content type (plugin-aware)
}

export interface IncrementalRendererProps {
  content: string;
  className?: string;
  /** Disable all animations (character fade-in, block timeline) for performance */
  disableAnimation?: boolean;
  /** Custom Mermaid renderer component */
  SimpleStreamMermaid?: React.ComponentType<any>;
  /**
   * Callback invoked when the rendered content height changes.
   * Useful for notifying virtual lists to re-measure item heights.
   */
  onHeightChange?: (height: number) => void;
}

// ============================================================
// Markdown Element Types (for react-markdown component overrides)
// ============================================================

/** Base props for all markdown elements */
export interface MarkdownElementProps {
  children?: React.ReactNode;
  className?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  node?: any; // react-markdown passes complex Element/Node types; keep `any` to avoid fragile type imports
  [key: string]: unknown;
}

/** Props for span elements */
export interface MarkdownSpanProps extends MarkdownElementProps {}

/** Props for div elements */
export interface MarkdownDivProps extends MarkdownElementProps {}

/** Props for code elements */
export interface MarkdownCodeProps extends MarkdownElementProps {
  inline?: boolean;
  language?: string;
}

/** Props for table elements */
export interface MarkdownTableProps extends MarkdownElementProps {}

/** Props for pre elements */
export interface MarkdownPreProps extends MarkdownElementProps {}

