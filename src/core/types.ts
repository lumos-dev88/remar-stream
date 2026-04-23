import React from 'react';

/** Animation constants */
export const FADE_DURATION = 150;  // Character fade-in animation duration (ms)
export const DEFAULT_CHAR_DELAY = 80;  // Default character delay (ms) — overlaps with fade for smoother visual

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
  /** Custom Mermaid renderer component */
  SimpleStreamMermaid?: React.ComponentType<any>;
  /**
   * Debug callback: invoked every RAF frame with real-time streaming metrics.
   * Only fires during active streaming. Consumers should throttle internally if needed.
   */
  onStatsUpdate?: (stats: StreamStats) => void;
}

/**
 * Real-time streaming metrics exposed via onStatsUpdate callback.
 * All values are read-only snapshots of internal pipeline state.
 */
export interface StreamStats {
  /** Number of characters received but not yet displayed */
  backlog: number;
  /** Total characters received from input */
  targetCount: number;
  /** Total characters currently displayed to user */
  displayedCount: number;
  /** EMA-smoothed input rate (chars/sec) — estimates SSE arrival speed */
  inputCps: number;
  /** Current output rate (chars/sec) — actual display speed */
  outputCps: number;
  /** Pressure multiplier (1.0–4.5) — how much CPS is boosted to catch up */
  pressure: number;
  /** Whether fast-lane mode is active (backlog overwhelmed normal CPS) */
  isInFastLane: boolean;
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

