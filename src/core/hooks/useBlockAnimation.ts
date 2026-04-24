/**
 * Block animation state management Hook (Linear Render mode)
 *
 * [Architecture — Linear Render: CPS → React → rehype(span) → WAAPI]
 *
 * Animation timing is handled by WAAPI element.animate() triggered in
 * StreamdownBlock's useLayoutEffect. This hook only manages block lifecycle
 * states (pending → rendering → done) for settled detection.
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
}

interface UseBlockAnimationReturn {
  /** Block animation metadata for StreamingRenderer */
  blockAnimationMeta: Map<number, BlockAnimationMeta>;
  /** Get block state (for StreamingRenderer) */
  getBlockState: (index: number) => 'queued' | 'animating' | 'revealed';
  /** Mark block animation as complete */
  completeBlock: (index: number) => void;
}

/**
 * Count visible (non-whitespace) characters in a block.
 */
function countVisibleChars(content: string): number {
  let count = 0;
  for (const ch of content) {
    if (ch !== ' ' && ch !== '\t' && ch !== '\n' && ch !== '\r') count++;
  }
  return count;
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

  // Sync block state: add new blocks, clean up deleted blocks
  useEffect(() => {
    if (!isStreaming) {
      setBlockTimings(new Map());
      return;
    }

    const now = performance.now();
    setBlockTimings(prev => {
      let changed = false;
      const next = new Map(prev);

      blocks.forEach((_, index) => {
        if (!next.has(index)) {
          next.set(index, { state: 'rendering', startTime: now });
          changed = true;
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
  }, [blocks, isStreaming]);

  // Settled detection: mark blocks as done when estimated animation time has elapsed
  useEffect(() => {
    if (!isStreaming) return;

    const interval = setInterval(() => {
      setBlockTimings(prev => {
        let changed = false;
        const next = new Map(prev);

        for (const [index, timing] of next.entries()) {
          if (timing.state !== 'rendering') continue;
          const block = blocks[index];
          if (!block) continue;

          const visibleChars = countVisibleChars(block.content);
          const totalTimeNeeded = visibleChars * charDelay + fadeDuration;
          const elapsed = performance.now() - (timing.startTime ?? performance.now());

          if (elapsed >= totalTimeNeeded) {
            next.set(index, { ...timing, state: 'done' });
            changed = true;
          }
        }

        return changed ? next : prev;
      });
    }, 200);

    return () => clearInterval(interval);
  }, [blocks, isStreaming, charDelay, fadeDuration]);

  // Compute blockAnimationMeta — only settled flag matters in linear render mode
  const cachedMetaRef = useRef<Map<number, BlockAnimationMeta>>(new Map());
  const prevSettledSnapshotRef = useRef<string>('');
  const prevBlockIdentityRef = useRef<string>('');

  const blockAnimationMeta = useMemo(() => {
    const blockIdentity = blocks.map(b => b.key ?? `${b.blockType}:${b.startOffset}`).join('|');
    const structuralChange = blockIdentity !== prevBlockIdentityRef.current;
    prevBlockIdentityRef.current = blockIdentity;

    const settledEntries: string[] = [];
    blocks.forEach((_, index) => {
      const timing = blockTimings.get(index);
      const settled = !isStreaming || timing?.state === 'done' || disableAnimation;
      settledEntries.push(`${index}:${settled ? 1 : 0}`);
    });

    if (structuralChange || settledEntries.join(',') !== prevSettledSnapshotRef.current) {
      prevSettledSnapshotRef.current = settledEntries.join(',');
      const meta = new Map<number, BlockAnimationMeta>();
      blocks.forEach((_, index) => {
        const timing = blockTimings.get(index);
        const settled = !isStreaming || timing?.state === 'done' || disableAnimation;
        meta.set(index, { settled });
      });
      cachedMetaRef.current = meta;
      return meta;
    }

    return cachedMetaRef.current;
  }, [blocks, blockTimings, isStreaming, disableAnimation]);

  const getBlockState = useCallback((index: number) => {
    if (!isStreaming || disableAnimation) return 'revealed';
    const timing = blockTimingsRef.current.get(index);
    const state = timing?.state;
    if (state === 'done') return 'revealed';
    if (state === 'rendering') return 'animating';
    return 'queued';
  }, [isStreaming, disableAnimation]);

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

  return {
    blockAnimationMeta,
    getBlockState,
    completeBlock,
  };
}
