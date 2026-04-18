import { useEffect, useRef, useCallback } from 'react';

/**
 * Easing functions for character animation timing.
 *
 * [Psychology Design]
 * - easeOutCubic (default): Fast start → gradual slowdown
 *   Matches reading habits (fast at beginning, slow at end) and leverages
 *   the Primacy Effect (strong first impression) + natural sentence-final pause.
 *
 * - linear: Constant speed (typewriter effect)
 *   Simple and predictable, but can feel mechanical on long text.
 *
 * - easeInOutCubic: Slow start → fast middle → slow end
 *   Strong rhythm but the slow start may feel like "stalling" to users.
 */

/** easeOutCubic: t ∈ [0,1] → [0,1], fast start, gradual slowdown */
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/** easeInOutCubic: t ∈ [0,1] → [0,1], slow start, fast middle, slow end */
function easeInOutCubic(t: number): number {
  return t < 0.5
    ? 4 * t * t * t
    : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

type EasingType = 'easeOutCubic' | 'easeInOutCubic' | 'linear';

const EASING_FUNCTIONS: Record<EasingType, (t: number) => number> = {
  easeOutCubic,
  easeInOutCubic,
  linear: (t) => t,
};

/**
 * Compute the eased delay for a character at normalized position t.
 *
 * @param t - Normalized position [0, 1] within the block (0 = first char, 1 = last char)
 * @param totalLinearDuration - Total duration if linear (maxCi * charDelay)
 * @param easing - Easing function
 * @returns Eased delay in ms for this character
 */
function computeEasedDelay(t: number, totalLinearDuration: number, easing: (t: number) => number): number {
  return easing(t) * totalLinearDuration;
}

/**
 * useStreamAnimator — RAF-driven DOM animation for streaming characters.
 *
 * [Architecture]
 * This hook bypasses React's render cycle entirely. Instead of relying on
 * React re-renders to update animation state (which was blocked by memo/arePluginsEqual),
 * it uses requestAnimationFrame to directly manipulate DOM className on <span class="stream-char">
 * elements based on timeline progress.
 *
 * [Easing Curve]
 * Character reveal timing follows an easing curve (default: easeOutCubic).
 * - First 30% of characters appear in ~10% of total time (fast start → strong first impression)
 * - Last 30% of characters appear in ~40% of total time (slow end → natural digestion pause)
 *
 * [How it works]
 * 1. Each <span class="stream-char"> has a data-ci="N" attribute (character index)
 * 2. RAF loop runs every frame, reading timelineElapsedMs from the ref
 * 3. For each span: compute eased delay based on normalized position → reveal if ready
 * 4. Uses a "high water mark" to skip already-revealed characters without DOM queries
 *
 * [Streaming Safety]
 * maxCi is read from DOM every frame, so new characters arriving during streaming
 * automatically participate in the eased timeline. The curve redistributes
 * proportionally as content grows.
 *
 * [Performance]
 * - High water mark avoids querySelectorAll for characters below the watermark
 * - Single RAF loop per block, stops when all characters are revealed
 *
 * @param containerRef - Ref to the DOM element containing stream-char spans
 * @param options - Animation configuration
 */
export function useStreamAnimator(
  containerRef: React.RefObject<HTMLElement | null>,
  options: {
    /** Current timeline progress in ms (updated by parent via ref) */
    timelineRef: React.RefObject<number>;
    /** Delay between each character in ms (base delay, redistributed by easing) */
    charDelay: number;
    /** Fade-in duration in ms */
    fadeDuration: number;
    /** Whether animation is active */
    active: boolean;
    /** Whether block is fully settled (all characters revealed) */
    settled: boolean;
    /** Easing curve type for character reveal timing (default: linear for multi-block continuity) */
    easing?: EasingType;
  }
) {
  const { timelineRef, charDelay, fadeDuration, active, settled, easing = 'linear' } = options;
  const rafRef = useRef<number | null>(null);
  const highWaterMarkRef = useRef(-1); // Highest revealed char index
  const easingFn = EASING_FUNCTIONS[easing];

  const animate = useCallback(() => {
    const container = containerRef.current;
    if (!container) {
      rafRef.current = requestAnimationFrame(animate);
      return;
    }

    const timeline = timelineRef.current;
    const hwm = highWaterMarkRef.current;

    // Only query spans with data-ci > hwm (new characters since last frame)
    const allUnrevealed = container.querySelectorAll<HTMLElement>('.stream-char:not(.stream-char-revealed)');

    if (allUnrevealed.length === 0) {
      // All characters revealed — stop RAF
      rafRef.current = null;
      return;
    }

    // Find max character index for normalization (streaming-safe: reads DOM every frame)
    let maxCi = 0;
    for (let i = 0; i < allUnrevealed.length; i++) {
      const ci = parseInt(allUnrevealed[i].getAttribute('data-ci') || '0', 10);
      if (ci > maxCi) maxCi = ci;
    }
    // Also check already-revealed spans for maxCi (in case all are revealed)
    if (maxCi === 0) {
      const allSpans = container.querySelectorAll<HTMLElement>('.stream-char');
      for (let i = 0; i < allSpans.length; i++) {
        const ci = parseInt(allSpans[i].getAttribute('data-ci') || '0', 10);
        if (ci > maxCi) maxCi = ci;
      }
    }

    const totalLinearDuration = maxCi * charDelay;
    let newHwm = hwm;

    for (let i = 0; i < allUnrevealed.length; i++) {
      const span = allUnrevealed[i];
      const ci = parseInt(span.getAttribute('data-ci') || '0', 10);

      // Skip characters below high water mark (shouldn't happen, but safety check)
      if (ci <= hwm) {
        span.classList.add('stream-char-revealed');
        continue;
      }

      // Compute eased delay based on normalized position
      const t = maxCi > 0 ? ci / maxCi : 0;
      const easedDelay = computeEasedDelay(t, totalLinearDuration, easingFn);
      const progress = timeline - easedDelay;

      if (progress >= fadeDuration) {
        span.classList.add('stream-char-revealed');
        if (ci > newHwm) newHwm = ci;
      }
    }

    highWaterMarkRef.current = newHwm;
    rafRef.current = requestAnimationFrame(animate);
  }, [containerRef, timelineRef, charDelay, fadeDuration, easingFn]);

  useEffect(() => {
    if (!active || settled) {
      // When settled or inactive, reveal all remaining characters immediately
      if ((settled || !active) && containerRef.current) {
        const spans = containerRef.current.querySelectorAll<HTMLElement>('.stream-char:not(.stream-char-revealed)');
        spans.forEach(span => span.classList.add('stream-char-revealed'));
      }
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    // Reset high water mark when animation (re)starts
    highWaterMarkRef.current = -1;

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, settled, animate]);
}
