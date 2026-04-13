import { useRef, useCallback } from 'react';
import type { Pluggable } from 'unified';
import { rehypeStreamAnimated } from '../../../core/rehype-plugins/rehypeStreamAnimated';
import { FADE_DURATION } from '../../../core/types';
import type { BlockAnimationMeta } from '../../../core/types';

const MAX_CACHE_SIZE = 20;

interface TimelineStore {
  timeline: number;
  setTimeline(value: number): void;
}

interface UsePluginCacheOptions {
  charDelay: number;
}

/**
 * Custom hook to manage plugin cache with proper cache key generation
 * Each block gets independent plugin configuration based on its animation state
 */
export function usePluginCache(
  timelineStoreRef: React.RefObject<TimelineStore>,
  options: UsePluginCacheOptions
) {
  const { charDelay } = options;
  const charDelayRef = useRef(charDelay);
  charDelayRef.current = charDelay;
  const cacheRef = useRef<Map<string, Pluggable[]>>(new Map());

  const getPlugins = useCallback((animationMeta: BlockAnimationMeta | undefined): Pluggable[] => {
    // Settled blocks don't need animation plugin
    if (animationMeta?.settled) {
      return [];
    }

    const currentCharDelay = charDelayRef.current;

    // Default plugin for blocks without animation meta - use charDelay from options
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

    // Cache key based on stable values only — timeline is read via getter
    const cacheKey = `animating,charDelay:${animationMeta.charDelay}`;

    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      return cached;
    }

    // Create plugin with getter to read latest timeline value
    const plugins: Pluggable[] = [
      [
        rehypeStreamAnimated,
        {
          charDelay: animationMeta.charDelay,
          fadeDuration: FADE_DURATION,
          get timelineElapsedMs() {
            return timelineStoreRef.current?.timeline ?? 0;
          },
          revealed: false,
        },
      ],
    ];

    // LRU cache eviction
    if (cacheRef.current.size >= MAX_CACHE_SIZE) {
      const firstKey = cacheRef.current.keys().next().value;
      if (firstKey) {
        cacheRef.current.delete(firstKey);
      }
    }
    cacheRef.current.set(cacheKey, plugins);

    return plugins;
  }, [timelineStoreRef]);

  return getPlugins;
}
