import { useCallback, useEffect, useRef, useState } from 'react';
import remend from 'remend';
import { clamp, countChars, getNow, toCharArray } from '../utils';
import { trimTrailingIncompleteSyntax } from '../lib/trimTrailingIncompleteSyntax';
import { getLatexRemendHandlers } from '../lib/remendLatexHandlers';

// Pre-create LaTeX handlers to avoid recreating on each call
const latexHandlers = getLatexRemendHandlers();

// remend configuration with LaTeX support
// Disable links and images: prevent [ in formulas from being incorrectly recognized as link start
// Disable katex: prevent $$ from being converted to $$$$, remark-math handles formulas itself
// Note: Both links: false and images: false must be set to completely disable link processing
const remendOptions = {
  links: false,
  images: false,
  katex: false,
  handlers: latexHandlers,
};

interface StreamSmoothingConfig {
  activeInputWindowMs: number;
  defaultCps: number;
  emaAlpha: number;
  flushCps: number;
  largeAppendChars: number;
  maxActiveCps: number;
  maxCps: number;
  maxFlushCps: number;
  minCps: number;
  /** Duration of slow-start ramp-up phase (frames) */
  rampUpFrames: number;
  /** Minimum ramp multiplier at start (0.3 = 30% of base CPS) */
  rampMinMultiplier: number;
  /** Duration of smooth drain phase after input stops (ms) */
  drainDurationMs: number;
  targetBufferMs: number;
}

// Stream smoothing configuration - unified three-layer architecture
// Layer 1 (rampUp):   First 8 frames → CPS gradually increases (smooth start)
// Layer 2 (steady):   EMA-adaptive CPS follows LLM output speed
// Layer 3 (drain):    Input stopped → CPS linearly decays to 0 (smooth ending)
const STREAM_CONFIG: StreamSmoothingConfig = {
  activeInputWindowMs: 180,
  defaultCps: 45,
  emaAlpha: 0.25,
  flushCps: 140,
  largeAppendChars: 150,
  maxActiveCps: 150,
  maxCps: 85,
  maxFlushCps: 320,
  minCps: 20,
  rampUpFrames: 8,
  rampMinMultiplier: 0.3,
  drainDurationMs: 500,
  targetBufferMs: 100,
};

interface UseSmoothStreamContentOptions {
  enabled?: boolean;
  /** Disable animation mode: optimize performance, skip smoothing */
  disableAnimation?: boolean;
}

export const useSmoothStreamContent = (
  content: string,
  { enabled = true, disableAnimation = false }: UseSmoothStreamContentOptions = {},
): string => {
  // Defensive programming: ensure content is a string
  const safeContent = typeof content === 'string' ? content : '';

  // Use single optimized stream configuration
  const config = STREAM_CONFIG;

  const [displayedContent, setDisplayedContent] = useState(() => remend(trimTrailingIncompleteSyntax(safeContent), remendOptions));

  const displayedContentRef = useRef(safeContent);
  const displayedCountRef = useRef(countChars(safeContent));

  const targetContentRef = useRef(safeContent);
  const targetCharsRef = useRef(toCharArray(safeContent));
  const targetCountRef = useRef(targetCharsRef.current.length);

  const emaCpsRef = useRef(config.defaultCps);
  const lastInputTsRef = useRef(0);
  const lastInputCountRef = useRef(targetCountRef.current);
  const chunkSizeEmaRef = useRef(1);
  const arrivalCpsEmaRef = useRef(config.defaultCps);

  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);
  const wakeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPressureRef = useRef(1);
  const charAccumulatorRef = useRef(0);

  const clearWakeTimer = useCallback(() => {
    if (wakeTimerRef.current !== null) {
      clearTimeout(wakeTimerRef.current);
      wakeTimerRef.current = null;
    }
  }, []);

  const stopFrameLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameTsRef.current = null;
  }, []);

  const stopScheduling = useCallback(() => {
    stopFrameLoop();
    clearWakeTimer();
    charAccumulatorRef.current = 0;
  }, [clearWakeTimer, stopFrameLoop]);

  const startFrameLoopRef = useRef<() => void>(() => {});

  const scheduleFrameWake = useCallback(
    (delayMs: number) => {
      clearWakeTimer();
      wakeTimerRef.current = setTimeout(
        () => {
          wakeTimerRef.current = null;
          startFrameLoopRef.current();
        },
        Math.max(1, Math.ceil(delayMs)),
      );
    },
    [clearWakeTimer],
  );

  const syncImmediate = useCallback(
    (nextContent: string) => {
      stopScheduling();

      const chars = toCharArray(nextContent);

      targetContentRef.current = nextContent;
      targetCharsRef.current = chars;
      targetCountRef.current = chars.length;

      const trimmedContent = trimTrailingIncompleteSyntax(nextContent);
      const completeContent = remend(trimmedContent, remendOptions);
      displayedContentRef.current = nextContent;
      displayedCountRef.current = chars.length;
      setDisplayedContent(completeContent);

      emaCpsRef.current = config.defaultCps;
      chunkSizeEmaRef.current = 1;
      arrivalCpsEmaRef.current = config.defaultCps;
      lastInputTsRef.current = getNow();
      lastInputCountRef.current = chars.length;
    },
    [config.defaultCps, stopScheduling],
  );

  const startFrameLoop = useCallback(() => {
    clearWakeTimer();
    if (rafRef.current !== null) return;

    // Don't start RAF while page is hidden — content will be synced on visible
    if (document.visibilityState === 'hidden') return;

    // Optimization: Use more efficient RAF loop to reduce unnecessary frames
      let frameCount = 0;
      const targetFps = 60;
      const frameInterval = 1000 / targetFps;

      const tick = (ts: number) => {
        // Optimization: Control frame rate to avoid over-rendering
        if (lastFrameTsRef.current !== null) {
          const elapsed = ts - lastFrameTsRef.current;
          if (elapsed < frameInterval * 0.8) {
            rafRef.current = requestAnimationFrame(tick);
            return;
          }
        }

      if (lastFrameTsRef.current === null) {
        lastFrameTsRef.current = ts - 16; // Assume 16ms (60fps) for first frame
      }

      const frameIntervalMs = Math.max(0, ts - lastFrameTsRef.current);
      // Optimization: Limit dt range to avoid anomalous values
      const dtSeconds = Math.max(0.001, Math.min(frameIntervalMs / 1000, 0.033));
      lastFrameTsRef.current = ts;
      frameCount++;

      const targetCount = targetCountRef.current;
      const displayedCount = displayedCountRef.current;
      const backlog = targetCount - displayedCount;

      if (backlog <= 0) {
        // Keep RAF alive during streaming — don't stop.
        // Stopping and restarting causes a 1-frame delay when new content arrives,
        // which the user perceives as a micro-stutter.
        // The RAF will be stopped when streaming ends (via stopScheduling cleanup).
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = getNow();
      const idleMs = now - lastInputTsRef.current;
      const inputActive = idleMs <= config.activeInputWindowMs;

      // ─── Layer 1: Ramp-up multiplier (smooth start) ───────────────
      // First N frames: CPS ramps from rampMinMultiplier → 1.0
      // Prevents EMA oscillation at startup, gives a "building up" feel
      const rampProgress = Math.min(1, frameCount / config.rampUpFrames);
      const rampMultiplier = config.rampMinMultiplier + (1 - config.rampMinMultiplier) * rampProgress;

      // ─── Layer 2: EMA-adaptive pressure (steady state) ─────────────
      // Same combinedPressure logic as before — adapts to LLM output speed
      const baseCps = clamp(emaCpsRef.current, config.minCps, config.maxCps);
      const baseLagChars = Math.max(1, Math.round((baseCps * config.targetBufferMs) / 1000));
      const lagUpperBound = Math.max(baseLagChars + 2, baseLagChars * 3);
      const targetLagChars = inputActive
        ? Math.round(
            clamp(baseLagChars + chunkSizeEmaRef.current * 0.35, baseLagChars, lagUpperBound),
          )
        : 0;
      const desiredDisplayed = Math.max(0, targetCount - targetLagChars);

      let pressureMultiplier: number;
      if (inputActive) {
        const backlogPressure = targetLagChars > 0 ? backlog / targetLagChars : 1;
        const chunkPressure = targetLagChars > 0 ? chunkSizeEmaRef.current / targetLagChars : 1;
        const arrivalPressure = arrivalCpsEmaRef.current / Math.max(baseCps, 1);
        pressureMultiplier = clamp(
          backlogPressure * 0.6 + chunkPressure * 0.25 + arrivalPressure * 0.15,
          1,
          4.5,
        );
      } else {
        // Smooth pressure decay: avoid sudden drop from 4.5x → 1.0x
        // Linearly decay from last known pressure to 1.0 over activeInputWindowMs
        const pressureDecayMs = config.activeInputWindowMs;
        if (idleMs <= pressureDecayMs) {
          const lastPressure = lastPressureRef.current;
          const decayProgress = idleMs / pressureDecayMs;
          pressureMultiplier = 1 + (lastPressure - 1) * (1 - decayProgress);
        } else {
          pressureMultiplier = 1;
        }
      }
      // Track last known pressure for smooth decay
      if (inputActive) {
        lastPressureRef.current = pressureMultiplier;
      }

      // ─── Layer 3: Smooth drain multiplier (graceful ending) ────────
      // After input stops: CPS linearly decays from 1.0 → 0 over drainDurationMs
      // Replaces the old abrupt settling/flush transition
      let drainMultiplier: number;
      if (inputActive) {
        drainMultiplier = 1;
      } else if (idleMs >= config.drainDurationMs) {
        drainMultiplier = 0; // Drain complete — stop output
      } else {
        drainMultiplier = 1 - (idleMs / config.drainDurationMs);
      }

      // ─── Unified formula ──────────────────────────────────────────
      // finalCps = baseCps × pressure × ramp × drain
      const activeCap = clamp(
        config.maxActiveCps + chunkSizeEmaRef.current * 6,
        config.maxActiveCps,
        config.maxFlushCps,
      );
      const rawCps = baseCps * pressureMultiplier * rampMultiplier * drainMultiplier;
      const currentCps = clamp(rawCps, config.minCps * drainMultiplier, activeCap);

      const urgentBacklog = inputActive && targetLagChars > 0 && backlog > targetLagChars * 2.2;
      const burstyInput = inputActive && chunkSizeEmaRef.current >= targetLagChars * 0.9;
      const minRevealChars = inputActive ? (urgentBacklog || burstyInput ? 2 : 1) : 2;

      // Sub-frame interpolation: use accumulator to avoid round() jitter
      // Without this, round(CPS * dt) produces 0,1,0,1,2 pattern causing uneven output
      charAccumulatorRef.current += currentCps * dtSeconds;
      let revealChars = Math.max(minRevealChars, Math.floor(charAccumulatorRef.current));
      charAccumulatorRef.current -= revealChars;
      // Floor the accumulator debt to prevent unbounded negative growth
      // when minRevealChars forces more output than CPS produces per frame
      if (charAccumulatorRef.current < -2) {
        charAccumulatorRef.current = -2;
      }

      if (inputActive) {
        const shortfall = desiredDisplayed - displayedCount;
        if (shortfall <= 0) {
          // Keep RAF alive — new content may arrive at any time
          rafRef.current = requestAnimationFrame(tick);
          return;
        }
        revealChars = Math.min(revealChars, shortfall, backlog);
      } else {
        revealChars = Math.min(revealChars, backlog);
      }

      const nextCount = displayedCount + revealChars;
      const segment = targetCharsRef.current.slice(displayedCount, nextCount).join('');

      if (segment) {
        const prevDisplayed = displayedContentRef.current;
        const nextDisplayed = prevDisplayed + segment;
        displayedContentRef.current = nextDisplayed;
        displayedCountRef.current = nextCount;
        // Synchronous update — yieldToMain caused intermittent stuttering
        // by introducing unpredictable async delays in the RAF hot path.
        // The RAF loop itself already yields to the browser between frames.
        const trimmedContent = trimTrailingIncompleteSyntax(nextDisplayed);
        const completeContent = remend(trimmedContent, remendOptions);
        setDisplayedContent(completeContent);
      } else {
        displayedContentRef.current = targetContentRef.current;
        displayedCountRef.current = targetCount;
        const trimmedContent = trimTrailingIncompleteSyntax(targetContentRef.current);
        const completeContent = remend(trimmedContent, remendOptions);
        setDisplayedContent(completeContent);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [
    clearWakeTimer,
    config.activeInputWindowMs,
    config.drainDurationMs,
    config.maxActiveCps,
    config.maxCps,
    config.maxFlushCps,
    config.minCps,
    config.rampMinMultiplier,
    config.rampUpFrames,
    config.targetBufferMs,
    scheduleFrameWake,
    stopFrameLoop,
  ]);
  startFrameLoopRef.current = startFrameLoop;

  useEffect(() => {
    // Defensive programming: ensure content is a string
    const inputContent = typeof content === 'string' ? content : '';

    // When animation disabled or hook disabled, sync content directly
    if (disableAnimation || !enabled) {
      syncImmediate(inputContent);
      return;
    }

    const prevTargetContent = targetContentRef.current;
    if (inputContent === prevTargetContent) return;

    const now = getNow();
    const appendOnly = inputContent.startsWith(prevTargetContent);

    if (!appendOnly) {
      syncImmediate(inputContent);
      return;
    }

    const appended = inputContent.slice(prevTargetContent.length);
    const appendedChars = toCharArray(appended);
    const appendedCount = appendedChars.length;

    if (appendedCount > config.largeAppendChars) {
      syncImmediate(inputContent);
      return;
    }

    targetContentRef.current = inputContent;
    targetCharsRef.current = [...targetCharsRef.current, ...appendedChars];
    targetCountRef.current += appendedCount;

    const deltaChars = targetCountRef.current - lastInputCountRef.current;
    const deltaMs = Math.max(1, now - lastInputTsRef.current);

    if (deltaChars > 0) {
      const instantCps = (deltaChars * 1000) / deltaMs;
      const normalizedInstantCps = clamp(instantCps, config.minCps, config.maxFlushCps * 2);
      const chunkEmaAlpha = 0.35;
      chunkSizeEmaRef.current =
        chunkSizeEmaRef.current * (1 - chunkEmaAlpha) + appendedCount * chunkEmaAlpha;
      arrivalCpsEmaRef.current =
        arrivalCpsEmaRef.current * (1 - chunkEmaAlpha) + normalizedInstantCps * chunkEmaAlpha;

      const clampedCps = clamp(instantCps, config.minCps, config.maxActiveCps);
      emaCpsRef.current = emaCpsRef.current * (1 - config.emaAlpha) + clampedCps * config.emaAlpha;
    }

    lastInputTsRef.current = now;
    lastInputCountRef.current = targetCountRef.current;

    startFrameLoop();
  }, [
    config.emaAlpha,
    config.largeAppendChars,
    config.maxActiveCps,
    config.maxCps,
    config.maxFlushCps,
    config.minCps,
    content,
    enabled,
    disableAnimation,
    startFrameLoop,
    syncImmediate,
  ]);

  useEffect(() => () => stopScheduling(), [stopScheduling]);

  // When page becomes hidden, sync displayed content to target immediately.
  // When page becomes visible again, sync again to drain any backlog that
  // accumulated between the hidden sync and the actual visibility change.
  // Without this, API continues pushing data while RAF is paused, creating a
  // backlog that flushes all at once when the user returns (visual "pile-up").
  useEffect(() => {
    if (disableAnimation || !enabled) return;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        syncImmediate(targetContentRef.current);
      } else if (document.visibilityState === 'visible') {
        // Drain any backlog that accumulated after the hidden sync
        syncImmediate(targetContentRef.current);
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [disableAnimation, enabled, syncImmediate]);

  // When animation disabled, return content with remend applied (no RAF animation)
  if (disableAnimation) {
    const trimmedContent = trimTrailingIncompleteSyntax(safeContent);
    return remend(trimmedContent, remendOptions);
  }

  return displayedContent;
};
