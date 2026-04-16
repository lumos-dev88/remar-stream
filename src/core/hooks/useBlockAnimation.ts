/**
 * Block animation state management Hook
 *
 * [Design Principles]
 * 1. Parallel rendering: All blocks start animation simultaneously without waiting for previous ones
 *    - Reason: In streaming scenarios, blocks may increase indefinitely; waiting would prevent subsequent blocks from displaying
 *    - Animation order is controlled by timelineElapsedMs, not start order
 *
 * 2. Time-driven: Use RAF to update timeRef without driving React re-renders
 *    - Performance optimization: Avoid triggering component re-renders every frame
 *    - blockTimings only updates on state changes (pending → rendering → done)
 *
 * 3. Auto settled: Automatically determine block completion based on animation time
 *    - Does not rely on onAnimationDone callback (may not trigger due to various reasons)
 *    - Determined by timelineElapsedMs >= content length * charDelay + fadeDuration
 *
 * [Timing Explanation]
 * T=0:    Block 0 starts (timelineElapsedMs = 0)
 * T=16:   Block 1 starts (timelineElapsedMs = 0) - parallel, not waiting for Block 0
 * T=100:  Block 0 displays up to the 8th character (timelineElapsedMs = 100)
 * T=100:  Block 1 displays up to the 3rd character (timelineElapsedMs = 100)
 *
 * [Notes]
 * - Do not add logic to "wait for previous block completion" as it causes deadlock
 * - Do not generate keys based on content hash; content changes during fast streaming cause flicker
 * - settled state is used for StaticRenderer switching, does not affect animation itself
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FADE_DURATION, DEFAULT_CHAR_DELAY } from '../types';
import type { BlockInfo, BlockAnimationMeta } from '../types';

type BlockState = 'pending' | 'rendering' | 'done';

interface BlockTiming {
  state: BlockState;
  startTime: number | null;
}

interface UseBlockAnimationOptions {
  isStreaming: boolean;
  disableAnimation: boolean;
  charDelay?: number;
  fadeDuration?: number;
  /** React 18 startTransition for batch state updates */
  startTransition?: (fn: () => void) => void;
}

interface UseBlockAnimationReturn {
  /** Block animation metadata for StreamingRenderer */
  blockAnimationMeta: Map<number, BlockAnimationMeta>;
  /** Get block state (for StreamingRenderer) */
  getBlockState: (index: number) => 'queued' | 'animating' | 'revealed';
  /** Mark block animation as complete */
  completeBlock: (index: number) => void;
  /** Reset all states */
  reset: () => void;
}

/**
 * Hook for managing block animation state
 *
 * [Key Implementation Details]
 *
 * 1. RAF loop (loop function)
 *    - Only updates timeRef.current without calling setState
 *    - Only updates the specific block's state when starting a new block
 *    - ⚠️ Do not add logic to "wait for previous block completion"
 *
 * 2. blockAnimationMeta calculation
 *    - Calculates timelineElapsedMs based on timeRef.current
 *    - settled is controlled by external completeBlock call (for StaticRenderer switching)
 *    - pending state uses negative timelineElapsedMs to ensure initial characters have animation
 *
 * 3. Performance optimization
 *    - timeRef does not drive re-renders
 *    - blockTimings only updates when necessary
 *    - Uses useMemo to cache blockAnimationMeta
 */
export function useBlockAnimation(
  blocks: BlockInfo[],
  options: UseBlockAnimationOptions
): UseBlockAnimationReturn {
  const { 
    isStreaming, 
    disableAnimation,
    charDelay = DEFAULT_CHAR_DELAY, 
    fadeDuration = FADE_DURATION,
    startTransition 
  } = options;
  
  // Block state (drives re-renders)
  const [blockTimings, setBlockTimings] = useState<Map<number, BlockTiming>>(new Map());

  // Use refs to store timestamps and RAF to avoid unnecessary re-renders
  const timeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // Sync block state: add new blocks, clean up deleted blocks
  useEffect(() => {
    if (!isStreaming) {
      setBlockTimings(new Map());
      return;
    }

    // Use startTransition for batch updates to avoid blocking rendering
      const updateBlockTimings = () => {
        setBlockTimings(prev => {
          const next = new Map(prev);
          let changed = false;

          // Add new blocks
          blocks.forEach((_, index) => {
            if (!next.has(index)) {
              next.set(index, { state: 'pending', startTime: null });
              changed = true;
            }
          });

          // Clean up deleted blocks
          for (const key of next.keys()) {
            if (key >= blocks.length) {
              next.delete(key);
              changed = true;
            }
          }

          return changed ? next : prev;
        });
      };

    if (startTransition) {
      startTransition(updateBlockTimings);
    } else {
      updateBlockTimings();
    }
  }, [blocks, isStreaming, startTransition]);

  /**
   * Animation loop: Use RAF to update timestamps
   *
   * [Important] Parallel start strategy:
   * - All pending blocks start immediately without waiting for previous ones
   * - Reason: In streaming scenarios, blocks continuously increase; waiting causes deadlock
   * - Animation order is controlled by timelineElapsedMs, not start order
   *
   * [React 18 Optimization]
   * - Use startTransition to batch state updates, marking as low priority
   * - Avoid RAF updates blocking user interactions and animation rendering
   */
  useEffect(() => {
    if (!isStreaming || disableAnimation) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const loop = (timestamp: number) => {
      timeRef.current = timestamp;

      // Start all pending blocks (parallel strategy)
      const updateTimings = () => {
        setBlockTimings(prev => {
          let next = prev;
          let changed = false;

          for (let i = 0; i < blocksRef.current.length; i++) {
            const timing = prev.get(i);
            if (timing?.state === 'pending') {
              // Delay creating Map until modification is truly needed
              if (!changed) {
                next = new Map(prev);
                changed = true;
              }
              // Start block: pending → rendering
              next.set(i, { state: 'rendering', startTime: timestamp });
            }
          }

          return changed ? next : prev;
        });
      };

      // Use startTransition to mark as low priority update
      if (startTransition) {
        startTransition(updateTimings);
      } else {
        updateTimings();
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isStreaming, disableAnimation, startTransition]);

  const blockAnimationMeta = useMemo(() => {
    const meta = new Map<number, BlockAnimationMeta>();
    const now = timeRef.current;

    // Count visible characters in a block (non-whitespace only, matching rehype plugin)
    const countVisibleChars = (content: string): number => {
      let count = 0;
      for (const ch of content) {
        if (ch !== ' ' && ch !== '\n' && ch !== '\r' && ch !== '\t') count++;
      }
      return count;
    };

    blocks.forEach((block, index) => {
      const timing = blockTimings.get(index);
      const state = timing?.state;

      let timelineElapsedMs: number;
      let settled: boolean;

      if (state === 'done' || !isStreaming) {
        settled = true;
        timelineElapsedMs = Infinity;
      } else if (state === 'rendering' && timing?.startTime) {
        settled = false;
        timelineElapsedMs = now - timing.startTime;

        // Cross-block timeline inheritance: make character animation flow
        // continuously across block boundaries. The user should not perceive
        // where one block ends and the next begins.
        if (index > 0) {
          const prevMeta = meta.get(index - 1);
          if (prevMeta && !prevMeta.settled && isFinite(prevMeta.timelineElapsedMs)) {
            timelineElapsedMs = Math.max(
              timelineElapsedMs,
              prevMeta.timelineElapsedMs + charDelay
            );
          }
        }

        // Dynamic speed-up: if the next block already exists and is animating,
        // accelerate this block's timeline so its wave front catches up to
        // the content end before the next block's wave becomes visible.
        if (index < blocks.length - 1) {
          const nextTiming = blockTimings.get(index + 1);
          if (nextTiming?.state === 'rendering' && nextTiming.startTime) {
            const visibleChars = countVisibleChars(block.content);
            const totalTimeNeeded = visibleChars * charDelay + fadeDuration;
            const remainingTime = totalTimeNeeded - timelineElapsedMs;

            if (remainingTime > 0) {
              const nextBlockElapsed = now - nextTiming.startTime;
              const timeUntilNextWaveVisible = nextBlockElapsed - fadeDuration;

              if (timeUntilNextWaveVisible > 0 && remainingTime > timeUntilNextWaveVisible) {
                const rawTarget = totalTimeNeeded - (timeUntilNextWaveVisible * 0.2);
                const maxTarget = totalTimeNeeded - fadeDuration;
                const targetTimeline = Math.min(rawTarget, maxTarget);
                timelineElapsedMs = Math.max(timelineElapsedMs, targetTimeline);
              } else if (timeUntilNextWaveVisible <= 0 && remainingTime > 0) {
                const targetTimeline = totalTimeNeeded - FADE_DURATION;
                if (timelineElapsedMs < targetTimeline) {
                  timelineElapsedMs = Math.max(timelineElapsedMs, targetTimeline);
                }
              }
            }
          }
        }
      } else {
        settled = false;
        timelineElapsedMs = -fadeDuration;
      }

      meta.set(index, {
        settled,
        charDelay,
        timelineElapsedMs,
        baseCharCount: 0,
      });
    });

    return meta;
  }, [blocks, blockTimings, isStreaming, charDelay, fadeDuration]);

  const getBlockState = useCallback((index: number) => {
    if (!isStreaming) return 'revealed';
    const timing = blockTimings.get(index);
    const state = timing?.state;
    if (state === 'done') return 'revealed';
    if (state === 'rendering') return 'animating';
    return 'queued';
  }, [blockTimings, isStreaming]);

  const completeBlock = useCallback((index: number) => {
    setBlockTimings(prev => {
      const timing = prev.get(index);
      if (timing && timing.state !== 'done') {
        const next = new Map(prev);
        next.set(index, { ...timing, state: 'done' });
        return next;
      }
      return prev;
    });
  }, []);

  const reset = useCallback(() => {
    setBlockTimings(new Map());
    timeRef.current = 0;
  }, []);

  return {
    blockAnimationMeta,
    getBlockState,
    completeBlock,
    reset,
  };
}
