/**
 * MathInline - Inline formula component
 *
 * [Core Design]
 * - Auto-close: Try rendering, display on success
 * - Syntax validation: Pass if KaTeX doesn't throw errors
 * - Cache on success: Store successful render results in cache
 * - Read from cache: Prioritize cache reads
 * - Incremental rendering: Display immediately when syntax is correct as formula forms
 * - Stale state: Keep previous successful render to avoid flicker
 */

import React, { memo, useMemo, useEffect } from 'react'
import { useFormulaRender } from './useFormulaRender'
import { injectKatexCss } from './injectKatexCss'
import { normalizeMathContent } from './utils'
import type { StreamingConfig } from './types'

interface MathInlineProps {
  /** Formula content (without $, can be string | any[] | undefined | null) */
  content: unknown
  /** Whether in streaming state */
  isStreaming?: boolean
  /** Streaming configuration */
  streamingConfig?: Partial<StreamingConfig>
}

export const MathInline = memo<MathInlineProps>(({
  content,
  isStreaming = false,
  streamingConfig,
}) => {
  // Inject KaTeX CSS on mount
  useEffect(() => {
    injectKatexCss()
  }, [])

  // Normalize content
  const normalizedContent = useMemo(() => normalizeMathContent(content), [content])

  const { status, html } = useFormulaRender(
    normalizedContent,
    isStreaming,
    false, // displayMode = false
    streamingConfig
  )

  // Don't render if content is empty (must be after all hooks)
  if (!normalizedContent.trim()) {
    return null
  }

  // Render success or stale: display formula (stale keeps previous successful render)
  if (html) {
    // Fixed Bug #10: Do NOT add --rendered animation class.
    // Adding it on render causes className change (remar-math-inline → remar-math-inline--rendered),
    // which triggers CSS transition, cascading to adjacent blocks' rehypeStreamAnimated state,
    // causing other text blocks to re-play their loading animation.
    // Animation is managed by rehypeStreamAnimated at block level, not by individual components.
    return (
      <span className="remar-math-inline">
        <span dangerouslySetInnerHTML={{ __html: html }} />
      </span>
    )
  }

  // Render not successful: display placeholder (raw text)
  // In streaming state, if formula is new (hasn't been successfully rendered yet), don't display to avoid flicker
  if (isStreaming && status === 'pending') {
    // In streaming state, new formulas are initially transparent or empty, displayed after render completes
    // This avoids "source → formula" flicker
    return (
      <span
        className="remar-math-inline remar-math-inline--streaming-pending"
        data-status={status}
        style={{ opacity: 0 }}
      >
        ${normalizedContent}$
      </span>
    )
  }

  return (
    <span
      className="remar-math-inline remar-math-inline--placeholder"
      data-status={status}
    >
      ${normalizedContent}$
    </span>
  )
})

MathInline.displayName = 'MathInline'
