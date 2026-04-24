/**
 * MathBlock - Block-level formula component
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

interface MathBlockProps {
  /** Formula content (without $$, can be string | any[] | undefined | null) */
  content: unknown
  /** Whether in streaming state */
  isStreaming?: boolean
  /** Streaming configuration */
  streamingConfig?: Partial<StreamingConfig>
}

export const MathBlock = memo<MathBlockProps>(({
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
    true, // displayMode = true
    streamingConfig
  )

  // Don't render if content is empty (must be after all hooks)
  if (!normalizedContent.trim()) {
    return null
  }

  // Render success or stale: display formula (stale keeps previous successful render)
  if (html) {
    // Fixed Bug #10: Do NOT add --rendered animation class.
    // Same reasoning as MathInline — see MathInline.tsx for details.
    return (
      <div className={`remar-math-block remar-math-block--${status}`}>
        <div dangerouslySetInnerHTML={{ __html: html }} />
      </div>
    )
  }

  // Render not successful: display placeholder (raw text)
  // In streaming state, if formula is new (hasn't been successfully rendered yet), don't display to avoid flicker
  if (isStreaming && status === 'pending') {
    // In streaming state, new formulas are initially transparent or empty, displayed after render completes
    // This avoids "source → formula" flicker
    return (
      <div
        className="remar-math-block remar-math-block--streaming-pending"
        data-status={status}
        style={{ opacity: 0 }}
      >
        <pre>$${normalizedContent}$$</pre>
      </div>
    )
  }

  return (
    <div
      className="remar-math-block remar-math-block--placeholder"
      data-status={status}
    >
      <pre>$${normalizedContent}$$</pre>
    </div>
  )
})

MathBlock.displayName = 'MathBlock'
