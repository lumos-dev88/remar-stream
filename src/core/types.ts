import React from 'react';

/** Animation constants */
export const FADE_DURATION = 200;  // Character fade-in animation duration (ms)
export const DEFAULT_CHAR_DELAY = 12;  // Default character delay (ms)

/**
 * Block content type
 * - Standard markdown types: 'paragraph', 'heading', 'code', etc.
 * - Plugin-specific types: 'mermaid', 'math-block', etc.
 * - Pending type: 'code-pending' for streaming incomplete code blocks
 */
export type BlockContentType =
  | 'paragraph'
  | 'heading'
  | 'code'
  | 'code-pending'  // Streaming: lang line not complete
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
  isTypePending?: boolean;       // True if type may change during streaming
}

export type BlockState = 'revealed' | 'animating' | 'streaming' | 'queued';

export interface BlockAnimationMeta {
  settled: boolean;
  charDelay: number;
  timelineElapsedMs: number;
}

export interface IncrementalRendererProps {
  content: string;
  isStreaming?: boolean;
  className?: string;
  /** Disable all animations (character fade-in, block timeline) for performance */
  disableAnimation?: boolean;
  /** Visible range of total blocks in the viewport (for viewport-priority lazy rendering) */
  viewportBlockRange?: { start: number; end: number };
  /** Custom SimpleStreamMermaid component */
  SimpleStreamMermaid?: React.ComponentType<{ children: string }>;
}

export interface StreamAnimatedOptions {
  baseCharCount?: number;
  charDelay?: number;
  fadeDuration?: number;
  revealed?: boolean;
  timelineElapsedMs?: number;
}

export interface RemarComponents {
  code?: React.ComponentType<any>;
  [key: string]: React.ComponentType<any> | undefined;
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

