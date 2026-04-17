import type { FormulaRenderOptions, FormulaRenderResult } from './types'
import { getCachedFormula, setCachedFormula } from './formulaCache'

/**
 * KaTeX renderer
 *
 * Core Features:
 * - Dynamic KaTeX loading
 * - Cache management
 * - Error handling
 */

let katexInstance: typeof import('katex') | null = null
let importPromise: Promise<typeof import('katex') | null> | null = null

/**
 * Get KaTeX instance (with caching)
 */
export async function getKatex(): Promise<typeof import('katex') | null> {
  // Return directly if already loaded
  if (katexInstance) return katexInstance

  // Loading in progress, reuse Promise
  if (importPromise) return importPromise

  // Start loading
  importPromise = import('katex')
    .then((mod) => {
      katexInstance = mod
      return mod
    })
    .catch(() => {
      // 允许重试：清除缓存的 promise，下次调用重新加载
      importPromise = null
      return null
    })

  return importPromise
}

/**
 * Reset KaTeX instance (for testing or error recovery)
 */
export function resetKatex(): void {
  katexInstance = null
  importPromise = null
}

/**
 * Check if KaTeX is loaded
 */
export function isKatexLoaded(): boolean {
  return katexInstance !== null
}

/**
 * Render formula synchronously (only when KaTeX is already loaded)
 * Returns HTML string on success, null on failure or not loaded
 */
export function renderFormulaToStringSync(
  content: string,
  displayMode: boolean
): string | null {
  if (!katexInstance) return null
  try {
    return katexInstance.renderToString(content, {
      throwOnError: true,
      displayMode,
    })
  } catch {
    return null
  }
}

/**
 * Render formula (with caching)
 */
export async function renderFormula(
  content: string,
  displayMode = false,
  options: FormulaRenderOptions = {}
): Promise<FormulaRenderResult> {
  // Check cache
  const cached = getCachedFormula(content, displayMode)
  if (cached !== undefined) {
    return { status: 'success', html: cached }
  }

  // Load KaTeX
  const katex = await getKatex()
  if (!katex) {
    return { status: 'error', error: 'KaTeX loading failed' }
  }

  try {
    const html = katex.renderToString(content, {
      throwOnError: options.throwOnError ?? true,
      displayMode,
      errorColor: options.errorColor ?? '#cc0000',
      macros: options.macros,
    })

    // Cache result
    setCachedFormula(content, html, displayMode)

    return { status: 'success', html }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Rendering failed'
    return { status: 'error', error: errorMessage }
  }
}

/**
 * Render formula synchronously (only available when KaTeX is loaded)
 */
export function renderFormulaSync(
  content: string,
  displayMode = false,
  options: FormulaRenderOptions = {}
): FormulaRenderResult {
  const cached = getCachedFormula(content, displayMode)
  if (cached !== undefined) {
    return { status: 'success', html: cached }
  }

  if (!katexInstance) {
    return { status: 'error', error: 'KaTeX not loaded' }
  }

  try {
    const html = katexInstance.renderToString(content, {
      throwOnError: options.throwOnError ?? true,
      displayMode,
      errorColor: options.errorColor ?? '#cc0000',
      macros: options.macros,
    })

    setCachedFormula(content, html, displayMode)

    return { status: 'success', html }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Rendering failed'
    return { status: 'error', error: errorMessage }
  }
}

export function preloadKatex(): void {
  if (!katexInstance && !importPromise) {
    getKatex()
  }
}
