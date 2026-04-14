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
  settleAfterMs: number;
  settleDrainMaxMs: number;
  settleDrainMinMs: number;
  targetBufferMs: number;
}

// Stream smoothing configuration - single optimized preset
// Previous multiple presets (realtime/balanced/silky) were removed because:
// 1. Dynamic CPS calculation masked preset differences
// 2. 60fps RAF limit made differences imperceptible
// 3. AI output speed (30-50 CPS) converged all presets to similar values
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
  settleAfterMs: 300,
  settleDrainMaxMs: 450,
  settleDrainMinMs: 150,
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
        lastFrameTsRef.current = ts;
        rafRef.current = requestAnimationFrame(tick);
        return;
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
        stopFrameLoop();
        return;
      }

      const now = getNow();
      const idleMs = now - lastInputTsRef.current;
      const inputActive = idleMs <= config.activeInputWindowMs;
      const settling = !inputActive && idleMs >= config.settleAfterMs;

      const baseCps = clamp(emaCpsRef.current, config.minCps, config.maxCps);
      const baseLagChars = Math.max(1, Math.round((baseCps * config.targetBufferMs) / 1000));
      const lagUpperBound = Math.max(baseLagChars + 2, baseLagChars * 3);
      const targetLagChars = inputActive
        ? Math.round(
            clamp(baseLagChars + chunkSizeEmaRef.current * 0.35, baseLagChars, lagUpperBound),
          )
        : 0;
      const desiredDisplayed = Math.max(0, targetCount - targetLagChars);

      let currentCps: number;
      if (inputActive) {
        const backlogPressure = targetLagChars > 0 ? backlog / targetLagChars : 1;
        const chunkPressure = targetLagChars > 0 ? chunkSizeEmaRef.current / targetLagChars : 1;
        const arrivalPressure = arrivalCpsEmaRef.current / Math.max(baseCps, 1);
        const combinedPressure = clamp(
          backlogPressure * 0.6 + chunkPressure * 0.25 + arrivalPressure * 0.15,
          1,
          4.5,
        );
        const activeCap = clamp(
          config.maxActiveCps + chunkSizeEmaRef.current * 6,
          config.maxActiveCps,
          config.maxFlushCps,
        );
        currentCps = clamp(baseCps * combinedPressure, config.minCps, activeCap);
      } else if (settling) {
        const drainTargetMs = clamp(backlog * 8, config.settleDrainMinMs, config.settleDrainMaxMs);
        const settleCps = (backlog * 1000) / drainTargetMs;
        currentCps = clamp(settleCps, config.flushCps, config.maxFlushCps);
      } else {
        const idleFlushCps = Math.max(
          config.flushCps,
          baseCps * 1.8,
          arrivalCpsEmaRef.current * 0.8,
        );
        currentCps = clamp(idleFlushCps, config.flushCps, config.maxFlushCps);
      }

      const urgentBacklog = inputActive && targetLagChars > 0 && backlog > targetLagChars * 2.2;
      const burstyInput = inputActive && chunkSizeEmaRef.current >= targetLagChars * 0.9;
      const minRevealChars = inputActive ? (urgentBacklog || burstyInput ? 2 : 1) : 2;
      let revealChars = Math.max(minRevealChars, Math.round(currentCps * dtSeconds));

      if (inputActive) {
        const shortfall = desiredDisplayed - displayedCount;
        if (shortfall <= 0) {
          stopFrameLoop();
          scheduleFrameWake(config.activeInputWindowMs - idleMs);
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
        // First truncate trailing incomplete line-start syntax, then use remend to auto-close Markdown syntax (with LaTeX support)
        const trimmedContent = trimTrailingIncompleteSyntax(nextDisplayed);
        const completeContent = remend(trimmedContent, remendOptions);
        displayedContentRef.current = nextDisplayed;
        displayedCountRef.current = nextCount;
        setDisplayedContent(completeContent);
      } else {
        const prevDisplayed = displayedContentRef.current;
        displayedContentRef.current = targetContentRef.current;
        displayedCountRef.current = targetCount;
        // First truncate trailing incomplete line-start syntax, then use remend to auto-close Markdown syntax (with LaTeX support)
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
    config.flushCps,
    config.maxActiveCps,
    config.maxCps,
    config.maxFlushCps,
    config.minCps,
    config.settleAfterMs,
    config.settleDrainMaxMs,
    config.settleDrainMinMs,
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

  // When animation disabled, return content with remend applied (no RAF animation)
  if (disableAnimation) {
    const trimmedContent = trimTrailingIncompleteSyntax(safeContent);
    return remend(trimmedContent, remendOptions);
  }

  return displayedContent;
};
