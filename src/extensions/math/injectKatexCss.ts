/**
 * KaTeX CSS Injection Utility
 *
 * Injects KaTeX CSS into document head when needed.
 * Only injects once across all component instances.
 *
 * Strategy: Try to resolve katex CSS via import.meta.url (local bundler resolution).
 * Fallback to CDN if import.meta.url is not available or resolution fails
 * (e.g., in certain tsup/esbuild output formats where __filename is unavailable).
 */

// Module-level state to track injection status
let katexCssInjected = false;

/** CDN fallback URL — used when local resolution via import.meta.url is unavailable */
const KATEX_CDN_URL = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';

/**
 * Attempt to resolve katex CSS locally via import.meta.url.
 * Returns the resolved URL string, or null if unavailable.
 *
 * Note: import.meta.url is a static ESM construct understood by esbuild/tsup.
 * It is replaced at build time with the resolved URL of the output chunk.
 * If the bundler does not support it (unlikely in this project), the catch
 * block will fall back to the CDN URL.
 */
function resolveLocalKatexCss(): string | null {
  try {
    return new URL('katex/dist/katex.min.css', import.meta.url).href;
  } catch {
    return null;
  }
}

/**
 * Inject KaTeX CSS into document head
 * Only injects once across all component instances
 */
export function injectKatexCss(): void {
  if (katexCssInjected || typeof document === 'undefined') return;

  // Check if already exists (e.g., manually added by user)
  const existing = document.querySelector('link[data-remar-katex-css]');
  if (existing) {
    katexCssInjected = true;
    return;
  }

  // Try local katex CSS first; fall back to CDN
  const href = resolveLocalKatexCss() ?? KATEX_CDN_URL;

  // Create link element
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = href;
  link.setAttribute('data-remar-katex-css', 'true');
  // Only set crossOrigin for CDN URLs (local URLs don't need it)
  if (href.startsWith('http')) {
    link.crossOrigin = 'anonymous';
  }

  document.head.appendChild(link);
  katexCssInjected = true;
}

/**
 * Check if KaTeX CSS has been injected
 */
export function isKatexCssInjected(): boolean {
  return katexCssInjected;
}

/**
 * Reset injection state (mainly for testing)
 */
export function resetKatexCssInjection(): void {
  katexCssInjected = false;
}
