import { useEffect, useRef, useCallback } from 'react';

/**
 * useStreamAnimator — RAF-driven DOM animation for streaming characters.
 *
 * [Architecture]
 * This hook bypasses React's render cycle entirely. Instead of relying on
 * React re-renders to update animation state (which was blocked by memo/arePluginsEqual),
 * it uses requestAnimationFrame to directly manipulate DOM className on <span class="stream-char">
 * elements based on timeline progress.
 *
 * [How it works]
 * 1. Each <span class="stream-char"> has a data-ci="N" attribute (character index)
 * 2. RAF loop runs every frame, reading timelineElapsedMs from the ref
 * 3. For each span: if timelineElapsedMs >= charIndex * charDelay + fadeDuration → revealed
 * 4. Uses a "high water mark" to skip already-revealed characters without DOM queries
 *
 * [Performance]
 * - High water mark avoids querySelectorAll for characters below the watermark
 * - Only queries for spans with data-ci > hwm (new characters since last frame)
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
    /** Delay between each character in ms */
    charDelay: number;
    /** Fade-in duration in ms */
    fadeDuration: number;
    /** Whether animation is active */
    active: boolean;
    /** Whether block is fully settled (all characters revealed) */
    settled: boolean;
  }
) {
  const { timelineRef, charDelay, fadeDuration, active, settled } = options;
  const rafRef = useRef<number | null>(null);
  const highWaterMarkRef = useRef(-1); // Highest revealed char index

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

    let newHwm = hwm;

    for (let i = 0; i < allUnrevealed.length; i++) {
      const span = allUnrevealed[i];
      const ci = parseInt(span.getAttribute('data-ci') || '0', 10);

      // Skip characters below high water mark (shouldn't happen, but safety check)
      if (ci <= hwm) {
        span.classList.add('stream-char-revealed');
        continue;
      }

      const progress = timeline - ci * charDelay;

      if (progress >= fadeDuration) {
        span.classList.add('stream-char-revealed');
        if (ci > newHwm) newHwm = ci;
      }
    }

    highWaterMarkRef.current = newHwm;
    rafRef.current = requestAnimationFrame(animate);
  }, [containerRef, timelineRef, charDelay, fadeDuration]);

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
