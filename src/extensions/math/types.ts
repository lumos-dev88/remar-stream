/**
 * Formula plugin type definitions
 *
 * Core Design:
 * - Incremental rendering: maintain stability as formula forms
 * - Layered architecture: data layer, render layer, cache layer separated
 */

/** Formula block type */
export type FormulaType = 'formula-inline' | 'formula-block'

/** Formula render status */
export type FormulaRenderStatus = 'pending' | 'rendering' | 'success' | 'error'

/** Formula data block */
export interface FormulaBlock {
  /** Unique identifier */
  id: string
  /** Formula type */
  type: FormulaType
  /** Raw content (without $) */
  content: string
  /** Whether complete (has closing $) */
  isComplete: boolean
  /** Whether valid (passes heuristic detection, excludes amounts, etc.) */
  isValid: boolean
}

/** Formula render options */
export interface FormulaRenderOptions {
  /** Whether display mode (block formula) */
  displayMode?: boolean
  /** Whether to throw errors */
  throwOnError?: boolean
  /** Error color */
  errorColor?: string
  /** Macro definitions */
  macros?: Record<string, string>
}

/** Formula render result */
export interface FormulaRenderResult {
  /** Render status
   * - pending: never rendered successfully
   * - success: current content rendered successfully
   * - stale: previous content rendered successfully, current content rendering failed
   */
  status: FormulaRenderStatus | 'stale'
  /** Rendered HTML (current or previous) */
  html?: string
  /** Error message */
  error?: string
}

/** Cache entry */
export interface CacheEntry {
  /** Rendered HTML */
  html: string
  /** Cache timestamp */
  timestamp: number
  /** Access count */
  accessCount: number
}

/** Streaming render configuration */
export interface StreamingConfig {
  /** Debounce delay (milliseconds) */
  debounceMs: number
  /** Minimum render length */
  minLength: number
  /** Whether to enable cache */
  enableCache: boolean
  /**
   * Whether to enable progressive rendering
   * - true: try rendering even if formula is incomplete, show gradual build process
   * - false: only render complete formulas, keep previous frame until success
   */
  progressiveRender: boolean
}

/** Default streaming configuration */
export const DEFAULT_STREAMING_CONFIG: StreamingConfig = {
  debounceMs: 10,
  minLength: 1,
  enableCache: true,
  progressiveRender: true,
}
