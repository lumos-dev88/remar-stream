import { useEffect, useRef, useState, useCallback } from 'react'
import type { FormulaRenderResult, StreamingConfig } from './types'
import { DEFAULT_STREAMING_CONFIG } from './types'
import { getCachedFormula, setCachedFormula } from './formulaCache'
import { getKatex } from './katex'

/**
 * Formula rendering Hook
 *
 * Core Design:
 * - Auto-close: Try rendering, display on success
 * - Syntax validation: Pass if KaTeX doesn't throw errors
 * - Cache on success: Store successful render results in cache
 * - Read from cache: Prioritize cache reads
 *
 * Incremental Rendering Strategy:
 * - Try rendering on each change as formula forms
 * - Display immediately when syntax is correct (no errors)
 * - No need to wait for complete closure
 */
export function useFormulaRender(
  content: string,
  isStreaming: boolean = false,
  displayMode: boolean = false,
  config: Partial<StreamingConfig> = {}
) {
  const mergedConfig = { ...DEFAULT_STREAMING_CONFIG, ...config }

  // Initialize state from cache to avoid flicker on component remount
  // This is crucial when switching between static/streaming modes
  const [result, setResult] = useState<FormulaRenderResult>(() => {
    // Check cache first for immediate display
    if (mergedConfig.enableCache) {
      const cached = getCachedFormula(content, displayMode)
      if (cached !== undefined) {
        return { status: 'success', html: cached }
      }
    }
    return { status: 'pending' }
  })

  const renderIdRef = useRef(0)
  const lastSuccessContentRef = useRef<string>('') // Record last successfully rendered content
  const lastSuccessHtmlRef = useRef<string>('')   // Record last successfully rendered HTML

  // Use ref to avoid unnecessary effect re-runs when config values change reference
  const configRef = useRef(mergedConfig)
  configRef.current = mergedConfig

  // Use ref for isStreaming to avoid triggering re-render on streaming→static switch
  // Fixes Bug #7: isStreaming in useEffect deps caused formula re-render on mode switch
  const isStreamingRef = useRef(isStreaming)
  isStreamingRef.current = isStreaming

  /**
   * Try to render formula
   * Success: return HTML
   * Failure: decide whether to return partial render result based on progressiveRender config
   */
  const tryRender = useCallback(async (signal: AbortSignal, currentContent: string, currentDisplayMode: boolean): Promise<string | null> => {
    const currentConfig = configRef.current

    // Check cache
    if (currentConfig.enableCache) {
      const cached = getCachedFormula(currentContent, currentDisplayMode)
      if (cached !== undefined) {
        return cached
      }
    }

    // Content too short, don't attempt rendering
    if (currentContent.length < currentConfig.minLength) {
      return null
    }

    try {
      const katex = await getKatex()
      if (!katex || signal.aborted) return null

      // Progressive rendering: try rendering even with syntax errors
      // This allows users to see the formula building process
      const html = katex.renderToString(currentContent, {
        throwOnError: !currentConfig.progressiveRender,
        displayMode: currentDisplayMode,
      })

      // Check if HTML contains any errors
      // KaTeX errors may use the following class names:
      // - katex-error: parse error
      // - katex-unknown-command: unknown command (e.g., \si)
      // - katex-undefined-command: undefined command
      const hasError = html.includes('katex-error') ||
                       html.includes('katex-unknown-command') ||
                       html.includes('katex-undefined-command') ||
                       html.includes('katex-mathml-error')
      if (hasError) {
        // Has errors, don't return HTML (formulas with errors are not displayed)
        return null
      }

      // Additional check: when throwOnError: false, KaTeX renders invalid commands as red text
      // Check for red-styled text (error color defaults to #cc0000 or #aa0000)
      const hasRedText = /color:\s*#(cc|aa)?0000/i.test(html) ||
                         /color:\s*rgb\(\s*204\s*,\s*0\s*,\s*0\s*\)/i.test(html)
      if (hasRedText) {
        // Has red text (possibly error), don't display
        return null
      }

      // Render success, cache result
      if (currentConfig.enableCache) {
        setCachedFormula(currentContent, html, currentDisplayMode)
      }

      return html
    } catch {
      // In non-progressive mode, return null on render failure
      // Won't reach here in progressive mode because throwOnError: false
      return null
    }
  }, []) // Empty deps - uses refs for all dynamic values

  useEffect(() => {
    const renderId = ++renderIdRef.current

    const abortController = new AbortController()
    const { signal } = abortController

    let timer: ReturnType<typeof setTimeout> | null = null

    const doRender = async () => {
      const currentConfig = configRef.current

      if (currentConfig.enableCache) {
        const cached = getCachedFormula(content, displayMode)
        if (cached !== undefined) {
          lastSuccessContentRef.current = content
          lastSuccessHtmlRef.current = cached
          setResult({ status: 'success', html: cached })
          return
        }
      }

      const html = await tryRender(signal, content, displayMode)

      if (signal.aborted) return
      if (renderId !== renderIdRef.current) return

      if (html) {
        lastSuccessContentRef.current = content
        lastSuccessHtmlRef.current = html
        setResult({ status: 'success', html })
      } else {
        if (lastSuccessHtmlRef.current) {
          setResult({ status: 'stale', html: lastSuccessHtmlRef.current })
        } else {
          setResult({ status: 'pending' })
        }
      }
    }

    if (isStreamingRef.current && configRef.current.debounceMs > 0) {
      timer = setTimeout(doRender, configRef.current.debounceMs)
    } else {
      doRender()
    }

    return () => {
      if (timer) clearTimeout(timer)
      abortController.abort()
    }
    // Only depend on content and displayMode — NOT isStreaming
    // isStreaming is read via ref to avoid re-rendering on streaming→static switch (Bug #7)
  }, [content, displayMode])

  return result
}

/**
 * Batch formula rendering hook (for block-level formula lists)
 */
export function useFormulaBatchRender(
  formulas: Array<{ id: string; content: string }>,
  isStreaming: boolean = false,
  displayMode: boolean = true,
  config: Partial<StreamingConfig> = {}
) {
  const mergedConfig = { ...DEFAULT_STREAMING_CONFIG, ...config }
  const [results, setResults] = useState<Map<string, FormulaRenderResult>>(new Map())
  const resultsRef = useRef(results)
  resultsRef.current = results
  const renderQueueRef = useRef<string[]>([])
  const isProcessingRef = useRef(false)
  const lastSuccessMapRef = useRef<Map<string, string>>(new Map())

  useEffect(() => {
    const pendingFormulas = formulas.filter(f => {
      const existing = resultsRef.current.get(f.id)
      return !existing || existing.status !== 'success'
    })

    pendingFormulas.forEach(f => {
      if (!renderQueueRef.current.includes(f.id)) {
        renderQueueRef.current.push(f.id)
      }
    })

    processQueue()
  }, [formulas])

  const processQueue = useCallback(async () => {
    if (isProcessingRef.current) return
    isProcessingRef.current = true

    while (renderQueueRef.current.length > 0) {
      const id = renderQueueRef.current[0]
      const formula = formulas.find(f => f.id === id)

      if (!formula) {
        renderQueueRef.current.shift()
        continue
      }

      const cached = getCachedFormula(formula.content, displayMode)
      if (cached !== undefined) {
        lastSuccessMapRef.current.set(id, formula.content)
        setResults(prev => new Map(prev).set(id, { status: 'success', html: cached }))
        renderQueueRef.current.shift()
        continue
      }

      if (formula.content.length < mergedConfig.minLength) {
        renderQueueRef.current.shift()
        continue
      }

      try {
        const katex = await getKatex()
        if (!katex) {
          renderQueueRef.current.shift()
          continue
        }

        const html = katex.renderToString(formula.content, {
          throwOnError: true,
          displayMode,
        })

        setCachedFormula(formula.content, html, displayMode)
        lastSuccessMapRef.current.set(id, formula.content)
        setResults(prev => new Map(prev).set(id, { status: 'success', html }))
      } catch {
        const lastSuccess = lastSuccessMapRef.current.get(id)
        if (lastSuccess && formula.content.startsWith(lastSuccess)) {
          const lastCached = getCachedFormula(lastSuccess, displayMode)
          if (lastCached) {
            setResults(prev => new Map(prev).set(id, { status: 'success', html: lastCached }))
          } else {
            setResults(prev => new Map(prev).set(id, { status: 'pending' }))
          }
        } else {
          setResults(prev => new Map(prev).set(id, { status: 'pending' }))
        }
      }

      renderQueueRef.current.shift()
    }

    isProcessingRef.current = false
  }, [formulas, displayMode, mergedConfig.minLength])

  return results
}
