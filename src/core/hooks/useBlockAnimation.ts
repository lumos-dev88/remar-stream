/**
 * Block animation state management Hook
 *
 * [Architecture — Single RAF Loop + Direct DOM]
 *
 * Each block has its own independent timeline: timelineElapsedMs = now - startTime.
 * Cross-block continuity is achieved via:
 * 1. Timeline inheritance: block[i].timeline >= block[i-1].timeline + charDelay
 * 2. Dynamic speed-up: if next block exists, accelerate current block's timeline
 *
 * [Single RAF Loop — merged producer + consumer]
 * Timeline computation AND DOM mutation happen in the same RAF callback.
 * This eliminates the ordering problem between useBlockAnimation (producer) and
 * Single RAF Loop (consumer) that existed in the previous architecture.
 *
 * StreamdownBlock registers its containerRef via registerContainer/unregisterContainer.
 * The RAF loop iterates all registered containers and performs classList operations
 * directly — no per-block RAF loops, no querySelectorAll ordering issues.
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
   * Retained for external consumers (debug tools, etc.).
   */
  timelineRefs: Map<number, React.MutableRefObject<number>>;
  /**
   * Register a block's containerRef for DOM animation.
   * The single RAF loop will directly manipulate className on this container's spans.
   */
  registerContainer: (index: number, ref: React.RefObject<HTMLElement | null>) => void;
  /**
   * Unregister a block's containerRef (on unmount).
   */
  unregisterContainer: (index: number) => void;
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
  prevMeta?: BlockAnimationMeta,
  visibleCharsCache?: Map<number, number>,
): { timelineElapsedMs: number; settled: boolean } {
  const timing = blockTimings.get(index);
  const state = timing?.state;

  if (state === 'done' || !isStreaming) {
    return { settled: true, timelineElapsedMs: Infinity };
  }

  if (state === 'rendering' && timing?.startTime) {
    let timelineElapsedMs = now - timing.startTime;

    // Cross-block continuity: ensure subsequent blocks don't start from timeline=0
    // (which would cause a visible "pause" between blocks), but also don't inherit
    // the full prevMeta timeline (which would skip fade-in for the first few chars).
    // Instead, start from charDelay so ci=0's progress = charDelay < fadeDuration,
    // giving a natural fade-in while maintaining visual flow between blocks.
    if (prevMeta && !prevMeta.settled && isFinite(prevMeta.timelineElapsedMs)) {
      timelineElapsedMs = Math.max(timelineElapsedMs, charDelay);
    }

    // Use cached visibleChars if available (RAF hot path), otherwise compute
    let visibleChars = visibleCharsCache?.get(index);
    if (visibleChars === undefined) {
      visibleChars = countVisibleChars(block.content);
      visibleCharsCache?.set(index, visibleChars);
    }
    const totalTimeNeeded = visibleChars * charDelay + fadeDuration;

    // Dynamic speed-up: only for blocks with enough characters to absorb it.
    // Short blocks (e.g., headings) skip speed-up to preserve their full animation.
    // A block needs at least fadeDuration/charDelay characters of animation
    // budget beyond the speed-up target to avoid feeling "jumped".
    const minCharsForSpeedup = Math.ceil(fadeDuration / charDelay) + 4;
    if (index < blocks.length - 1 && visibleChars >= minCharsForSpeedup) {
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
  const visibleCharsCacheRef = useRef<Map<number, number>>(new Map());
  const blocksRef = useRef(blocks);
  blocksRef.current = blocks;

  // Invalidate visibleChars cache when blocks change (content may have grown)
  useEffect(() => {
    visibleCharsCacheRef.current.clear();
  }, [blocks]);

  // MonotonicClock for freeze/thaw (visibilitychange-safe)
  const clockRef = useRef(getAnimationClock());

  // Per-block timeline refs — updated every RAF frame
  const timelineRefsRef = useRef<Map<number, React.MutableRefObject<number>>>(new Map());

  // ContainerRef registry — StreamdownBlock registers/unregisters via callbacks
  const containerRefsRef = useRef<Map<number, React.RefObject<HTMLElement | null>>>(new Map());

  // Per-block DOM animation state (moved from useStreamAnimator)
  const highWaterMarkRefs = useRef<Map<number, number>>(new Map());
  const prevMaxCiRefs = useRef<Map<number, number>>(new Map());
  const newCharGraceRefs = useRef<Map<number, Set<number>>>(new Map());

  // Ensure timeline refs exist for all blocks
  const getOrCreateTimelineRef = useCallback((index: number): React.MutableRefObject<number> => {
    let ref = timelineRefsRef.current.get(index);
    if (!ref) {
      ref = { current: 0 } as React.MutableRefObject<number>;
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
    // startTime is set to now (not now - fadeDuration) so that timelineElapsedMs
    // starts at 0. This ensures the first character of every block gets a proper
    // fade-in animation (progress starts below fadeDuration and grows into it).
    // The 1-frame grace in Single RAF Loop handles the CSS transition init delay.
    const now = clockRef.current.now();
    const initialStartTime = now;
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
   * Animation loop: Single RAF for timeline computation + DOM mutation.
   *
   * [Merged producer + consumer]
   * Previously, useBlockAnimation's RAF computed timeline (producer) and
   * useStreamAnimator's RAF read timeline + did classList.add (consumer).
   * Now both happen in the same callback — no ordering issues, no N separate RAFs.
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

      const currentBlocks = blocksRef.current;
      const currentTimings = blockTimingsRef.current;
      let prevMeta: BlockAnimationMeta | undefined;
      const visibleCharsCache = visibleCharsCacheRef.current;

      for (let i = 0; i < currentBlocks.length; i++) {
        const block = currentBlocks[i];
        const { timelineElapsedMs, settled } = computeBlockTimeline(
          i, block, currentBlocks, currentTimings,
          now, isStreaming, charDelay, fadeDuration, prevMeta,
          visibleCharsCache,
        );

        const ref = getOrCreateTimelineRef(i);
        if (ref) {
          ref.current = settled ? Infinity : timelineElapsedMs;
        }

        if (!settled) {
          prevMeta = { settled, charDelay, timelineElapsedMs };
        }

        // --- DOM mutation (merged from useStreamAnimator) ---
        const containerRef = containerRefsRef.current.get(i);
        const container = containerRef?.current;
        if (!container || settled) {
          // If settled, reveal all remaining chars immediately
          if (settled && container) {
            const spans = container.querySelectorAll<HTMLElement>('.stream-char:not(.stream-char-revealed)');
            for (let j = 0; j < spans.length; j++) {
              spans[j].classList.add('stream-char-revealed');
            }
            highWaterMarkRefs.current.delete(i);
            prevMaxCiRefs.current.delete(i);
            newCharGraceRefs.current.delete(i);
          }
          continue;
        }

        const timeline = timelineElapsedMs;

        // Initialize per-block state on first encounter
        if (!highWaterMarkRefs.current.has(i)) {
          // Recover HWM from existing DOM (for DOM rebuild continuity)
          let recoveredHwm = -1;
          let recoveredMaxCi = -1;
          const revealedSpans = container.querySelectorAll<HTMLElement>('.stream-char.stream-char-revealed');
          for (let j = 0; j < revealedSpans.length; j++) {
            const ci = parseInt(revealedSpans[j].getAttribute('data-ci') || '0', 10);
            if (ci > recoveredHwm) recoveredHwm = ci;
          }
          const allSpans = container.querySelectorAll<HTMLElement>('.stream-char');
          for (let j = 0; j < allSpans.length; j++) {
            const ci = parseInt(allSpans[j].getAttribute('data-ci') || '0', 10);
            if (ci > recoveredMaxCi) recoveredMaxCi = ci;
          }
          highWaterMarkRefs.current.set(i, recoveredHwm);
          prevMaxCiRefs.current.set(i, recoveredMaxCi);
          newCharGraceRefs.current.set(i, new Set());
        }

        const hwm = highWaterMarkRefs.current.get(i)!;
        const prevMax = prevMaxCiRefs.current.get(i)!;
        const grace = newCharGraceRefs.current.get(i)!;

        // Use .stream-char (no :not) + HWM skip — avoids forced style recalculation
        const allChars = container.querySelectorAll<HTMLElement>('.stream-char');
        let maxCi = prevMax;

        for (let j = 0; j < allChars.length; j++) {
          const ci = parseInt(allChars[j].getAttribute('data-ci') || '0', 10);
          if (ci > maxCi) maxCi = ci;
        }

        // Detect newly appeared characters — grant 1-frame grace for CSS transition init
        if (maxCi > prevMax) {
          for (let j = 0; j < allChars.length; j++) {
            const ci = parseInt(allChars[j].getAttribute('data-ci') || '0', 10);
            if (ci > prevMax) {
              grace.add(ci);
            }
          }
        }

        prevMaxCiRefs.current.set(i, maxCi);

        // Process grace: chars added last frame are now eligible
        const eligibleGrace = grace.size > 0;
        if (eligibleGrace) {
          grace.clear();
        }

        const totalLinearDuration = maxCi * charDelay;
        let newHwm = hwm;

        for (let j = 0; j < allChars.length; j++) {
          const span = allChars[j];
          const ci = parseInt(span.getAttribute('data-ci') || '0', 10);

          // Skip below HWM
          if (ci <= hwm) {
            if (!span.classList.contains('stream-char-revealed')) {
              span.classList.add('stream-char-revealed');
            }
            continue;
          }

          // Skip brand-new characters (first frame grace)
          if (ci > prevMax) {
            continue;
          }

          const easedDelay = ci * charDelay;
          const progress = timeline - easedDelay;

          if (progress >= fadeDuration) {
            span.classList.add('stream-char-revealed');
            if (ci > newHwm) newHwm = ci;
          }
        }

        highWaterMarkRefs.current.set(i, newHwm);
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
   * itself is now driven by timelineRefs + Single RAF Loop.
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

  const registerContainer = useCallback((index: number, ref: React.RefObject<HTMLElement | null>) => {
    containerRefsRef.current.set(index, ref);
  }, []);

  const unregisterContainer = useCallback((index: number) => {
    containerRefsRef.current.delete(index);
    highWaterMarkRefs.current.delete(index);
    prevMaxCiRefs.current.delete(index);
    newCharGraceRefs.current.delete(index);
  }, []);

  const reset = useCallback(() => {
    setBlockTimings(new Map());
    timeRef.current = 0;
    timelineRefsRef.current.clear();
    containerRefsRef.current.clear();
    highWaterMarkRefs.current.clear();
    prevMaxCiRefs.current.clear();
    newCharGraceRefs.current.clear();
  }, []);

  return {
    blockAnimationMeta,
    getBlockState,
    completeBlock,
    reset,
    timelineRefs: timelineRefsRef.current,
    registerContainer,
    unregisterContainer,
  };
}
