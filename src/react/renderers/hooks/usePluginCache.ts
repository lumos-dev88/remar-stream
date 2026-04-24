import { useRef, useCallback } from 'react';
import type { Pluggable } from 'unified';
import { rehypeStreamAnimated } from '../../../core/rehype-plugins/rehypeStreamAnimated';

/**
 * Custom hook to manage rehype plugin configuration for animated blocks.
 *
 * [Design: Stable plugin instance — prevent DOM structure change on settled]
 *
 * Key insight: rehype plugin ALWAYS generates span.stream-char[data-ci].
 * WAAPI element.animate() handles the fade-in (no class toggling needed).
 *
 * The difference between animating and settled:
 * - animating: span.stream-char (opacity:0) → useLayoutEffect triggers element.animate()
 * - settled:    span.stream-char (opacity:0, no animation triggered)
 *
 * By always applying the same plugin instance, the DOM structure never changes
 * when settled state changes. StreamdownBlock skips element.animate() when settled.
 *
 * This eliminates the flicker that occurred when settled=true caused rehypePlugins
 * to change from [plugin] to [], triggering ReactMarkdown to re-render without spans.
 */
export function usePluginCache() {
  // Single static plugin instance — always the same reference
  // rehypeStreamAnimated() takes no options in WAAPI mode
  const markPlugin = useRef<Pluggable>([
    rehypeStreamAnimated,
  ]).current;

  // Stable array reference — prevents unnecessary useMemo recalculation
  // in StreamdownBlock's rehypePluginsWithRef
  const pluginsArray = useRef<Pluggable[]>([markPlugin]).current;

  const getPlugins = useCallback((_settled: boolean): Pluggable[] => {
    // Always return the same array instance — DOM structure never changes
    return pluginsArray;
  }, [pluginsArray]);

  return getPlugins;
}
