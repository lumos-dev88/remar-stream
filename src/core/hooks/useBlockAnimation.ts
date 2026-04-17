/**
 * Block animation state management Hook
 *
 * [Architecture — Per-Block Timeline with Inheritance + Speed-Up]
 *
 * Each block has its own independent timeline: timelineElapsedMs = now - startTime.
 * Cross-block continuity is achieved via:
 * 1. Timeline inheritance: block[i].timeline >= block[i-1].timeline + charDelay
 * 2. Dynamic speed-up: if next block exists, accelerate current block's timeline
 *
 * [Animation Driver: RAF + Direct DOM]
 * Timeline progress is exposed via timelineRefs (one ref per block), updated every
 * RAF frame. useStreamAnimator reads these refs to directly manipulate DOM className,
 * completely bypassing React's render cycle.
 *
 * [MonotonicClock Integration]
 * Uses MonotonicClock instead of raw RAF timestamp for visibilitychange safety.
 * When page goes hidden, clock freezes; when visible, clock resumes without jump.
 *
 * [Design Principles]
 * 1. Parallel rendering: All blocks start animation simultaneously
 * 2. Time-driven: RAF updates timeRef + timelineRefs without driving React re-renders
 * 3. Auto settled: Based on timelineElapsedMs >= content.length * charDelay + fadeDuration
 *
 * [Notes]
 * - Do not add "wait for previous block" logic — causes deadlock in streaming
 * - Do not generate keys based on content hash — causes flicker during fast streaming
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FADE_DURATION, DEFAULT_CHAR_DELAY } from '../types';
import type { BlockInfo, BlockAnimationMeta } from '../types';
import { getAnimationClock } from '../utils/monotonic-clock';

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
  /**
   * Per-block timeline refs, updated every RAF frame.
   * Each ref.current holds the current timelineElapsedMs for that block.
   * Used by useStreamAnimator to drive DOM animation without React re-renders.
   */
  timelineRefs: Map<number, React.RefObject<number>>;
}

/**
 * Count visible (non-whitespace) characters in a block.
 * Matches the rehype plugin's character counting logic.
 */
function countVisibleChars(content: string): number {
  let count = 0;
  for (const ch of content) {
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') count++;
  }
  return count;
}

/**
 * Compute timeline for a single block with inheritance + speed-up.
 * Extracted as a pure function for reuse in both useMemo and RAF loop.
 */
function computeBlockTimeline(
  index: number,
  block: BlockInfo,
  blocks: BlockInfo[],
  blockTimings: Map<number, BlockTiming>,
  now: number,
  isStreaming: boolean,
  charDelay: number,
  fadeDuration: number,
  prevMeta?: BlockAnimationMeta
): { timelineElapsedMs: number; settled: boolean } {
  const timing = blockTimings.get(index);
  const state = timing?.state;

  if (state === 'done' || !isStreaming) {
    return { settled: true, timelineElapsedMs: Infinity };
  }

  if (state === 'rendering' && timing?.startTime) {
    let timelineElapsedMs = now - timing.startTime;

    // Cross-block timeline inheritance
    if (prevMeta && !prevMeta.settled && isFinite(prevMeta.timelineElapsedMs)) {
      timelineElapsedMs = Math.max(
        timelineElapsedMs,
        prevMeta.timelineElapsedMs + charDelay
      );
    }

    // Short block protection: reserve at least fadeDuration ms of animation
    // Prevents short blocks (headings, short paragraphs) from instantly popping in
    // when they inherit a large timeline from the previous block.
    // The last few characters still get a smooth fade-in transition.
    const visibleChars = countVisibleChars(block.content);
    const totalTimeNeeded = visibleChars * charDelay + fadeDuration;
    if (visibleChars > 0 && timelineElapsedMs > totalTimeNeeded - fadeDuration) {
      timelineElapsedMs = totalTimeNeeded - fadeDuration;
    }

    // Dynamic speed-up
    if (index < blocks.length - 1) {
      const nextTiming = blockTimings.get(index + 1);
      if (nextTiming?.state === 'rendering' && nextTiming.startTime) {
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

    return { settled: false, timelineElapsedMs };
  }

  // pending state
  return { settled: false, timelineElapsedMs: -fadeDuration };
}

export function useBlockAnimation(
  blocks: BlockInfo[],
  options: UseBlockAnimationOptions
): UseBlockAnimationReturn {
  const {
    isStreaming,
    disableAnimation,
    charDelay = DEFAULT_CHAR_DELAY,
    fadeDuration = FADE_DURATION,
  } = options;

  // Block state (drives re-renders)
  const [blockTimings, setBlockTimings] = useState<Map<number, BlockTiming>>(new Map());
  const blockTimingsRef = useRef(blockTimings);
  blockTimingsRef.current = blockTimings;

  // Use refs to store timestamps and RAF to avoid unnecessary re-renders
  const timeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // MonotonicClock for freeze/thaw (visibilitychange-safe)
  const clockRef = useRef(getAnimationClock());

  // Per-block timeline refs — updated every RAF frame for useStreamAnimator
  const timelineRefsRef = useRef<Map<number, React.RefObject<number>>>(new Map());

  // Ensure timeline refs exist for all blocks
  const getOrCreateTimelineRef = useCallback((index: number): React.RefObject<number> => {
    let ref = timelineRefsRef.current.get(index);
    if (!ref) {
      ref = { current: 0 } as React.RefObject<number>;
      timelineRefsRef.current.set(index, ref);
    }
    return ref;
  }, []);

  // Sync block state: add new blocks, clean up deleted blocks
  useEffect(() => {
    if (!isStreaming) {
      setBlockTimings(new Map());
      return;
    }

    // Direct synchronous update — no startTransition.
    // New blocks start directly in 'rendering' state (not 'pending') to eliminate
    // the queued → rendering round-trip that caused 2-3 extra frames of delay
    // at animation startup. The RAF loop still updates timeline refs every frame.
    //
    // startTime is set to (now - fadeDuration) so that timelineElapsedMs starts
    // at fadeDuration, allowing the first character to be revealed immediately
    // (progress = timelineElapsedMs - 0*charDelay = fadeDuration >= fadeDuration).
    // This eliminates the 300ms "blank period" at animation startup where no
    // characters are visible.
    const now = clockRef.current.now();
    const initialStartTime = now - fadeDuration;
    setBlockTimings(prev => {
      const next = new Map(prev);
      let changed = false;

      blocks.forEach((_, index) => {
        if (!next.has(index)) {
          next.set(index, { state: 'rendering', startTime: initialStartTime });
          changed = true;
          // Ensure timeline ref exists for new block
          getOrCreateTimelineRef(index);
        }
      });

      for (const key of next.keys()) {
        if (key >= blocks.length) {
          next.delete(key);
          changed = true;
        }
      }

      return changed ? next : prev;
    });
  }, [blocks, isStreaming, getOrCreateTimelineRef]);

  /**
   * Animation loop: Use RAF to update timestamps AND per-block timeline refs.
   *
   * [Per-block timeline refs]
   * Each block's timelineRef.current is updated every frame with the latest
   * timelineElapsedMs (including inheritance + speed-up). useStreamAnimator
   * reads these refs to directly manipulate DOM className.
   */
  useEffect(() => {
    if (!isStreaming || disableAnimation) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    const loop = () => {
      timeRef.current = clockRef.current.now();
      const now = timeRef.current;

      // Start all pending blocks (parallel strategy)
      setBlockTimings(prev => {
        let next = prev;
        let changed = false;

        for (let i = 0; i < blocksRef.current.length; i++) {
          const timing = prev.get(i);
          if (timing?.state === 'pending') {
            if (!changed) {
              next = new Map(prev);
              changed = true;
            }
            next.set(i, { state: 'rendering', startTime: clockRef.current.now() });
          }
        }

        return changed ? next : prev;
      });

      // Update per-block timeline refs (direct DOM animation driver)
      const currentBlocks = blocksRef.current;
      const currentTimings = blockTimingsRef.current; // Read latest timings via ref (not closure)
      let prevMeta: BlockAnimationMeta | undefined;

      for (let i = 0; i < currentBlocks.length; i++) {
        const block = currentBlocks[i];
        const { timelineElapsedMs, settled } = computeBlockTimeline(
          i, block, currentBlocks, currentTimings,
          now, isStreaming, charDelay, fadeDuration, prevMeta
        );

        const ref = getOrCreateTimelineRef(i);
        if (ref) {
          ref.current = settled ? Infinity : timelineElapsedMs;
        }

        if (!settled) {
          prevMeta = { settled, charDelay, timelineElapsedMs };
        }
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isStreaming, disableAnimation, charDelay, fadeDuration, getOrCreateTimelineRef]);

  /**
   * Compute blockAnimationMeta (React state for settled detection).
   * This still drives re-renders for settled state changes, but animation
   * itself is now driven by timelineRefs + useStreamAnimator.
   */
  const blockAnimationMeta = useMemo(() => {
    const meta = new Map<number, BlockAnimationMeta>();
    const now = timeRef.current;
    let prevMeta: BlockAnimationMeta | undefined;

    blocks.forEach((block, index) => {
      // Ensure timeline ref exists during render phase (not just in useEffect)
      // so UnifiedRenderer can pass it to StreamdownBlock immediately
      getOrCreateTimelineRef(index);

      const { timelineElapsedMs, settled } = computeBlockTimeline(
        index, block, blocks, blockTimings,
        now, isStreaming, charDelay, fadeDuration, prevMeta
      );

      const animMeta: BlockAnimationMeta = {
        settled,
        charDelay,
        timelineElapsedMs,
      };
      meta.set(index, animMeta);

      if (!settled) {
        prevMeta = animMeta;
      }
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
    timelineRefsRef.current.clear();
  }, []);

  return {
    blockAnimationMeta,
    getBlockState,
    completeBlock,
    reset,
    timelineRefs: timelineRefsRef.current,
  };
}
