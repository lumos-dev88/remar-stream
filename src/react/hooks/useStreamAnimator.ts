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
 * useStreamAnimator — RAF-driven DOM animation for streaming characters.
 *
 * [Architecture]
 * This hook bypasses React's render cycle entirely. Instead of relying on
 * React re-renders to update animation state (which was blocked by memo/arePluginsEqual),
 * it uses requestAnimationFrame to directly manipulate DOM className on <span class="stream-char">
 * elements based on timeline progress.
 *
 * [Stable maxCi — streaming-safe easing]
 * maxCi is cached across frames. New characters arriving during streaming do NOT
 * change the normalized position of already-existing characters. This prevents
 * the "batch jump" effect where growing maxCi causes already-visible characters
 * to shift their eased delay and trigger premature reveal of later characters.
 *
 * [Linear = absolute delay]
 * For linear easing (the default for multi-block), delay is computed as ci * charDelay
 * directly — no normalization needed. This makes each character's reveal time
 * deterministic and stable regardless of future content growth.
 *
 * [First-char fade-in]
 * New characters (ci > prevMaxCi) are skipped for one frame after first appearing.
 * This gives the CSS transition time to initialize, ensuring the first character
 * of every block gets a proper fade-in animation instead of appearing instantly.
 *
 * [Performance]
 * - High water mark skips already-revealed characters
 * - Cached maxCi avoids full DOM scan every frame
 * - Single RAF loop per block, auto-stops when all revealed
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
  const prevMaxCiRef = useRef(-1); // Cached maxCi from previous frame (stable normalization)
  const newCharGraceRef = useRef<Set<number>>(new Set()); // New chars awaiting grace period
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

    // Find max character index — only scan unrevealed spans (performance)
    let maxCi = prevMaxCiRef.current;
    for (let i = 0; i < allUnrevealed.length; i++) {
      const ci = parseInt(allUnrevealed[i].getAttribute('data-ci') || '0', 10);
      if (ci > maxCi) maxCi = ci;
    }
    // Also check revealed spans if maxCi hasn't grown (block may be fully revealed)
    if (maxCi <= prevMaxCiRef.current) {
      const sampleRevealed = container.querySelectorAll<HTMLElement>('.stream-char.stream-char-revealed');
      for (let i = 0; i < sampleRevealed.length; i++) {
        const ci = parseInt(sampleRevealed[i].getAttribute('data-ci') || '0', 10);
        if (ci > maxCi) maxCi = ci;
      }
    }

    // Detect newly appeared characters (ci > prevMaxCi) — grant them a 1-frame grace
    // so CSS transition can initialize before we check reveal eligibility.
    // This ensures the first character of every block gets a proper fade-in.
    const prevMax = prevMaxCiRef.current;
    if (maxCi > prevMax) {
      const grace = newCharGraceRef.current;
      for (let i = 0; i < allUnrevealed.length; i++) {
        const ci = parseInt(allUnrevealed[i].getAttribute('data-ci') || '0', 10);
        if (ci > prevMax) {
          grace.add(ci);
        }
      }
    }

    // Update cached maxCi for next frame
    prevMaxCiRef.current = maxCi;

    // Compute total duration based on stable maxCi
    const totalLinearDuration = maxCi * charDelay;
    const isLinear = easing === 'linear';
    let newHwm = hwm;

    // Process grace: chars that have been in grace for ≥1 frame are now eligible
    const grace = newCharGraceRef.current;
    const eligibleGrace = grace.size > 0;
    if (eligibleGrace) {
      // Clear grace set — all current graced chars become eligible this frame
      // (they were added last frame, so 1 frame has passed)
      grace.clear();
    }

    for (let i = 0; i < allUnrevealed.length; i++) {
      const span = allUnrevealed[i];
      const ci = parseInt(span.getAttribute('data-ci') || '0', 10);

      // Skip characters below high water mark (shouldn't happen, but safety check)
      if (ci <= hwm) {
        span.classList.add('stream-char-revealed');
        continue;
      }

      // Skip brand-new characters (first frame grace for CSS transition init)
      // Note: grace was already cleared above, so chars added THIS frame are in grace
      // and will be processed next frame. Chars added LAST frame are now eligible.
      if (ci > prevMax) {
        continue; // Skip — will be processed next frame
      }

      // Compute delay: linear uses absolute ci*charDelay (stable, no normalization drift)
      // Non-linear uses normalized position against stable maxCi
      let easedDelay: number;
      if (isLinear) {
        easedDelay = ci * charDelay;
      } else {
        const t = maxCi > 0 ? ci / maxCi : 0;
        easedDelay = easingFn(t) * totalLinearDuration;
      }

      const progress = timeline - easedDelay;

      if (progress >= fadeDuration) {
        span.classList.add('stream-char-revealed');
        if (ci > newHwm) newHwm = ci;
      }
    }

    highWaterMarkRef.current = newHwm;
    rafRef.current = requestAnimationFrame(animate);
  }, [containerRef, timelineRef, charDelay, fadeDuration, easingFn, easing]);

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

    // Reset state when animation (re)starts
    highWaterMarkRef.current = -1;
    prevMaxCiRef.current = -1;
    newCharGraceRef.current = new Set();

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [active, settled, animate]);
}
