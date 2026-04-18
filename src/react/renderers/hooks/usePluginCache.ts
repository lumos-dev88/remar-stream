import { useRef, useCallback } from 'react';
import type { Pluggable } from 'unified';
import { rehypeStreamAnimated } from '../../../core/rehype-plugins/rehypeStreamAnimated';

/**
 * Custom hook to manage rehype plugin configuration for animated blocks.
 *
 * [Design: Stable plugin instance — prevent DOM structure change on settled]
 *
 * Key insight: rehype plugin ALWAYS generates span.stream-char[data-ci].
 * The difference between animating and settled is just the className:
 * - animating: span.stream-char (no revealed class → useStreamAnimator drives animation)
 * - settled:    span.stream-char.stream-char-revealed (immediately visible)
 *
 * By always applying the same plugin instance (revealed=false), the DOM structure
 * never changes when settled transitions. useStreamAnimator handles the settled
 * transition via RAF + direct DOM manipulation (adding stream-char-revealed class).
 *
 * This eliminates the flicker that occurred when settled=true caused rehypePlugins
 * to change from [plugin] to [], triggering ReactMarkdown to re-render without spans.
 */
export function usePluginCache() {
  // Single static plugin instance — always the same reference
  // revealed=false means spans start without stream-char-revealed class
  // useStreamAnimator adds stream-char-revealed via RAF when appropriate
  const markPlugin = useRef<Pluggable>([
    rehypeStreamAnimated,
    { revealed: false },
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
