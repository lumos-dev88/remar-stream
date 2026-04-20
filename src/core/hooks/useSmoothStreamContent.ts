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
  largeAppendChars: number;
  maxActiveCps: number;
  maxCps: number;
  maxFlushCps: number;
  minCps: number;
  /** Duration of smooth drain phase after input stops (ms) */
  drainDurationMs: number;
  targetBufferMs: number;
  /** Minimum CPS during drain (never fully stop — keeps drip flowing) */
  minDrainCps: number;
  /** Backlog threshold (chars) to burst out of drain when new content arrives */
  burstThresholdChars: number;
}

// Stream smoothing configuration - two-layer architecture
// Layer 1 (steady): EMA-adaptive CPS follows LLM output speed
// Layer 2 (drain):  Input stops → CPS decays to minDrainCps (not 0)
//   When backlog accumulates to burstThresholdChars → immediate full-speed burst
const STREAM_CONFIG: StreamSmoothingConfig = {
  activeInputWindowMs: 180,
  defaultCps: 45,
  emaAlpha: 0.25,
  largeAppendChars: 150,
  maxActiveCps: 150,
  maxCps: 85,
  maxFlushCps: 320,
  minCps: 20,
  drainDurationMs: 500,
  targetBufferMs: 100,
  minDrainCps: 5,
  burstThresholdChars: 15,
};

interface UseSmoothStreamContentOptions {
  enabled?: boolean;
}

export const useSmoothStreamContent = (
  content: string,
  { enabled = true }: UseSmoothStreamContentOptions = {},
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
  const smoothedPressureRef = useRef(1);
  const chunkIntervalEmaRef = useRef(config.targetBufferMs);

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
      smoothedPressureRef.current = 1;
      chunkIntervalEmaRef.current = config.targetBufferMs;
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

      const tick = (ts: number) => {
      if (lastFrameTsRef.current === null) {
        lastFrameTsRef.current = ts - 16; // Assume 16ms (60fps) for first frame
      }

      const frameIntervalMs = Math.max(0, ts - lastFrameTsRef.current);
      // Optimization: Limit dt range to avoid anomalous values
      const dtSeconds = Math.max(0.001, Math.min(frameIntervalMs / 1000, 0.033));
      lastFrameTsRef.current = ts;

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

      // ─── Layer 1: EMA-adaptive pressure (steady state) ─────────────
      // Same combinedPressure logic as before — adapts to LLM output speed
      const baseCps = clamp(emaCpsRef.current, config.minCps, config.maxCps);

      // Dynamic buffer: adapt to LLM chunk arrival interval.
      // When LLM is slow (chunk interval > targetBufferMs), increase buffer
      // to cover the gap — prevents CPS from running dry between chunks.
      // When LLM is fast, keep buffer at targetBufferMs for low latency.
      // Safety factor 1.2 ensures buffer always exceeds chunk interval by 20%.
      const effectiveBufferMs = Math.max(
        config.targetBufferMs,
        chunkIntervalEmaRef.current * 1.2,
      );
      const baseLagChars = Math.max(1, Math.round((baseCps * effectiveBufferMs) / 1000));
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

      // EMA-smooth pressure to prevent oscillation from network jitter
      const pressureAlpha = 0.3;
      smoothedPressureRef.current =
        smoothedPressureRef.current * (1 - pressureAlpha) + pressureMultiplier * pressureAlpha;
      pressureMultiplier = smoothedPressureRef.current;

      // ─── Layer 2: Smooth drain with burst recovery ──────────────────
      // When input stops: CPS decays from 1.0 → minDrainCps (not 0).
      // This keeps a slow drip flowing so the user doesn't see a complete halt.
      // If new content arrives during drain and backlog reaches burstThreshold,
      // immediately switch back to full-speed pressure (burst recovery).
      let drainMultiplier: number;
      if (inputActive) {
        // Input flowing — full speed
        drainMultiplier = 1;
      } else if (backlog >= config.burstThresholdChars) {
        // Burst recovery: enough content buffered during drain → full speed
        drainMultiplier = 1;
      } else if (idleMs >= config.drainDurationMs) {
        // Drain settled at minimum drip rate
        drainMultiplier = config.minDrainCps / baseCps;
      } else {
        // Draining: linearly decay from 1.0 → minDrainCps/baseCps
        const minDrainRatio = config.minDrainCps / baseCps;
        drainMultiplier = 1 - (1 - minDrainRatio) * (idleMs / config.drainDurationMs);
      }

      // ─── Unified formula ──────────────────────────────────────────
      // finalCps = baseCps × pressure × drain
      const activeCap = clamp(
        config.maxActiveCps + chunkSizeEmaRef.current * 6,
        config.maxActiveCps,
        config.maxFlushCps,
      );
      const rawCps = baseCps * pressureMultiplier * drainMultiplier;
      const currentCps = clamp(rawCps, config.minDrainCps * drainMultiplier, activeCap);

      const urgentBacklog = inputActive && targetLagChars > 0 && backlog > targetLagChars * 2.2;
      const burstyInput = inputActive && chunkSizeEmaRef.current >= targetLagChars * 0.9;
      const minRevealChars = inputActive ? (urgentBacklog || burstyInput ? 2 : 1) : 1;

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
    config.targetBufferMs,
    scheduleFrameWake,
    stopFrameLoop,
  ]);
  startFrameLoopRef.current = startFrameLoop;

  useEffect(() => {
    // Defensive programming: ensure content is a string
    const inputContent = typeof content === 'string' ? content : '';

    // When hook disabled, sync content directly
    if (!enabled) {
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
      const chunkEmaAlpha = 0.35;
      chunkSizeEmaRef.current =
        chunkSizeEmaRef.current * (1 - chunkEmaAlpha) + appendedCount * chunkEmaAlpha;
      arrivalCpsEmaRef.current =
        arrivalCpsEmaRef.current * (1 - chunkEmaAlpha) + instantCps * chunkEmaAlpha;

      const clampedCps = clamp(instantCps, config.minCps, config.maxActiveCps);
      emaCpsRef.current = emaCpsRef.current * (1 - config.emaAlpha) + clampedCps * config.emaAlpha;

      // Track chunk arrival interval for dynamic buffer sizing.
      // EMA-smoothed interval adapts to LLM output rhythm:
      //   LLM fast (30ms) → chunkIntervalEma ≈ 30ms
      //   LLM slow (150ms) → chunkIntervalEma ≈ 150ms
      // Used in RAF loop to compute effectiveBufferMs.
      const chunkIntervalAlpha = 0.3;
      chunkIntervalEmaRef.current =
        chunkIntervalEmaRef.current * (1 - chunkIntervalAlpha) + deltaMs * chunkIntervalAlpha;
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
    if (!enabled) return;

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
  }, [enabled, syncImmediate]);

  // CPS still runs (controls display rate) when animation is disabled.
  // The character fade-in animation is skipped at the rehype plugin level
  // (no rehype plugins = no span.stream-char wrapping).
  return displayedContent;
};
