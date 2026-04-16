import { useRef, useCallback } from 'react';
import type { Pluggable } from 'unified';
import { rehypeStreamAnimated } from '../../../core/rehype-plugins/rehypeStreamAnimated';
import { FADE_DURATION } from '../../../core/types';
import type { BlockAnimationMeta } from '../../../core/types';

/**
 * Custom hook to manage rehype plugin configuration for animated blocks
 *
 * [Design Decision: No caching for timeline-dependent plugins]
 *
 * Previously, plugins were cached by charDelay and reused across blocks and renders.
 * This caused a critical bug with list blocks: as list content grows during streaming,
 * the same cached plugin (with stale timelineElapsedMs) was reused, causing the
 * entire list block to re-animate from the beginning — appearing as a "flash" or "flicker".
 *
 * The fix: create a fresh plugin config on every call. The performance impact is
 * negligible because:
 * 1. StreamdownBlock's memo comparator skips timelineElapsedMs changes
 * 2. rehype only re-executes when children (content) actually changes
 * 3. The plugin config is a lightweight object (~4 properties)
 *
 * For settled blocks, we still return [] immediately (no plugin needed).
 */
export function usePluginCache(options: { charDelay: number }) {
  const { charDelay } = options;
  const charDelayRef = useRef(charDelay);
  charDelayRef.current = charDelay;

  const getPlugins = useCallback((animationMeta: BlockAnimationMeta | undefined): Pluggable[] => {
    // Settled blocks don't need animation plugin
    if (animationMeta?.settled) {
      return [];
    }

    const currentCharDelay = charDelayRef.current;

    // Default plugin for blocks without animation meta
    if (!animationMeta) {
      return [
        [
          rehypeStreamAnimated,
          {
            charDelay: currentCharDelay,
            fadeDuration: FADE_DURATION,
            timelineElapsedMs: 0,
            revealed: false,
          },
        ],
      ];
    }

    // Always create a fresh plugin config with the current timelineElapsedMs.
    // Do NOT cache — timelineElapsedMs changes with every blockAnimationMeta update,
    // and stale cached values cause list blocks to re-animate (flicker bug).
    return [
      [
        rehypeStreamAnimated,
        {
          charDelay: animationMeta.charDelay,
          fadeDuration: FADE_DURATION,
          timelineElapsedMs: animationMeta.timelineElapsedMs,
          revealed: false,
        },
      ],
    ];
  }, []);

  return getPlugins;
}
