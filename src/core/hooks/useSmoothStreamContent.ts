import { useCallback, useEffect, useRef, useState } from 'react';
import remend from 'remend';
import { clamp, countChars, getNow, toCharArray } from '../utils';
import { trimTrailingIncompleteSyntax } from '../lib/trimTrailingIncompleteSyntax';
import { getLatexRemendHandlers } from '../lib/remendLatexHandlers';
import type { StreamStats } from '../types';


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
  minCps: number;
  /** Duration of smooth drain phase after input stops (ms) */
  drainDurationMs: number;
  targetBufferMs: number;
  /** Minimum CPS during drain (never fully stop — keeps drip flowing) */
  minDrainCps: number;
  /** Backlog threshold (chars) to burst out of drain when new content arrives */
  burstThresholdChars: number;
  /**
   * When backlog exceeds this threshold, skip CPS throttling and sync
   * directly to the latest content. This prevents unbounded latency when
   * input rate exceeds maxActiveCps (e.g. fast small models like 1B/3B).
   * Set to 0 to disable.
   */
  backlogBypassThreshold: number;
}

// Stream smoothing configuration - two-layer architecture
// Layer 1 (steady): EMA-adaptive CPS follows LLM output speed
// Layer 2 (drain):  Input stops → CPS decays to minDrainCps (not 0)
//   When backlog accumulates to burstThresholdChars → immediate full-speed burst
const STREAM_CONFIG: StreamSmoothingConfig = {
  activeInputWindowMs: 300,
  defaultCps: 45,
  emaAlpha: 0.25,
  largeAppendChars: 300,
  maxActiveCps: 300,
  maxCps: 300,
  minCps: 20,
  drainDurationMs: 800,
  targetBufferMs: 300,
  minDrainCps: 25,
  burstThresholdChars: 15,
  backlogBypassThreshold: 200,
};

interface UseSmoothStreamContentOptions {
  enabled?: boolean;
  /** Debug callback: invoked every RAF frame with real-time streaming metrics */
  onStatsUpdate?: (stats: StreamStats) => void;
}

export const useSmoothStreamContent = (
  content: string,
  { enabled = true, onStatsUpdate }: UseSmoothStreamContentOptions = {},
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
  const smoothedPressureRef = useRef(1);
  const isInFastLaneRef = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  const rafRef = useRef<number | null>(null);
  const lastFrameTsRef = useRef<number | null>(null);
  const lastPressureRef = useRef(1);
  const charAccumulatorRef = useRef(0);
  const lastSetContentRef = useRef<string | null>(null);

  // ─── RC Arrival Jitter Filter (Layer 0) ─────────────────────────────
  // Smooths SSE chunk arrival intervals using RC low-pass filter model.
  // Adaptive τ: tracks arrival interval coefficient of variation (CV = σ/μ)
  // via EMA, and scales τ proportionally. Stable network → low τ (fast),
  // jittery network → high τ (strong smoothing).
  //   τ range: [TAU_MIN=30ms, TAU_MAX=200ms]
  //   CV mapping: τ = TAU_MIN + (TAU_MAX - TAU_MIN) × clamp(CV / CV_TARGET, 0, 1)
  const rcBufferRef = useRef<string[]>([]);
  const rcTauRef = useRef(50); // ms — adaptive, starts at midpoint
  const rcArrivalEmaRef = useRef(30); // EMA of arrival interval (ms)
  const rcArrivalVarEmaRef = useRef(0); // EMA of arrival interval variance (ms²)
  const rcLastArrivalTsRef = useRef(0); // last SSE arrival timestamp

  const TAU_MIN = 30;
  const TAU_MAX = 200;
  const CV_TARGET = 1.0;
  const RC_EMA_ALPHA = 0.3; // EMA smoothing for interval stats

  const stopFrameLoop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    lastFrameTsRef.current = null;
  }, []);

  const stopScheduling = useCallback(() => {
    stopFrameLoop();
    charAccumulatorRef.current = 0;
  }, [stopFrameLoop]);

  const startFrameLoopRef = useRef<() => void>(() => {});

  const syncImmediate = useCallback(
    (nextContent: string) => {
      stopScheduling();

      // Flush RC buffer before syncing — prevents character loss when
      // syncImmediate is triggered by visibility change, large append,
      // non-append content change, or disabled toggle.
      if (rcBufferRef.current.length > 0) {
        targetCharsRef.current.push(...rcBufferRef.current);
        targetCountRef.current = targetCharsRef.current.length;
        rcBufferRef.current = [];
      }

      const chars = toCharArray(nextContent);

      targetContentRef.current = nextContent;
      targetCharsRef.current = chars;
      targetCountRef.current = chars.length;

      // Clear RC buffer on immediate sync
      rcBufferRef.current = [];

      const trimmedContent = trimTrailingIncompleteSyntax(nextContent);
      const completeContent = remend(trimmedContent, remendOptions);
      displayedContentRef.current = nextContent;
      displayedCountRef.current = chars.length;
      setDisplayedContent(completeContent);

      emaCpsRef.current = config.defaultCps;
      smoothedPressureRef.current = 1;
      isInFastLaneRef.current = false;
      lastInputTsRef.current = getNow();
      // Reset adaptive τ state on full sync
      rcTauRef.current = 50;
      rcArrivalEmaRef.current = 30;
      rcArrivalVarEmaRef.current = 0;
      rcLastArrivalTsRef.current = 0;
    },
    [config.defaultCps, stopScheduling],
  );

  const startFrameLoop = useCallback(() => {
    if (rafRef.current !== null) return;

    // Don't start RAF while page is hidden — content will be synced on visible
    if (document.visibilityState === 'hidden') return;

    // Optimization: Use more efficient RAF loop to reduce unnecessary frames
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

      // ─── RC Arrival Jitter Filter: drain buffer → targetChars ──────
      // Release rcBuffer × (dt/τ) chars per frame (RC discharge curve).
      // This smooths SSE arrival jitter before CPS processes the backlog.
      const rcLen = rcBufferRef.current.length;
      if (rcLen > 0) {
        const currentTau = rcTauRef.current;
        const rcRelease = Math.max(1, Math.floor(rcLen * (frameIntervalMs / currentTau)));
        const fed = rcBufferRef.current.splice(0, rcRelease);
        if (fed.length > 0) {
          targetCharsRef.current.push(...fed);
          targetCountRef.current = targetCharsRef.current.length;
        }
      }

      const targetCount = targetCountRef.current;
      const displayedCount = displayedCountRef.current;
      const backlog = targetCount - displayedCount;

      if (backlog <= 0) {
        // When disabled (SSE ended), backlog drained — stop RAF and reset
        if (!enabledRef.current) {
          stopScheduling();
          emaCpsRef.current = config.defaultCps;
          smoothedPressureRef.current = 1;
          isInFastLaneRef.current = false;
          if (onStatsUpdate) {
            onStatsUpdate({
              backlog: 0,
              targetCount: targetCountRef.current,
              displayedCount: displayedCountRef.current,
              inputCps: 0,
              outputCps: 0,
              pressure: 1,
              isInFastLane: false,
            });
          }
          return;
        }
        // Keep RAF alive during streaming — don't stop.
        // Stopping and restarting causes a 1-frame delay when new content arrives,
        // which the user perceives as a micro-stutter.
        if (onStatsUpdate) {
          onStatsUpdate({
            backlog: 0,
            targetCount: targetCountRef.current,
            displayedCount: displayedCountRef.current,
            inputCps: emaCpsRef.current,
            outputCps: 0,
            pressure: 1,
            isInFastLane: false,
          });
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      // ─── Backlog fast-lane: boost CPS when input overwhelms output ────
      // When backlog exceeds threshold, normal CPS can't keep up.
      // Instead of instant sync (which causes a visible "chunk" of text),
      // we calculate a boosted CPS proportional to backlog size.
      // This produces a fast-but-smooth flow instead of an instant text dump.
      // Example: backlog=200 → fastCps=2000 → drains in ~0.1s
      //
      // Hysteresis prevents oscillation at the boundary:
      //   Enter fast-lane: backlog >= backlogBypassThreshold (200)
      //   Exit fast-lane:  backlog < backlogBypassThreshold / 4 (50)
      // Once entered, fast-lane stays active until backlog is well below threshold.
      const fastLaneEnter = config.backlogBypassThreshold;
      const fastLaneExit = Math.max(1, Math.floor(config.backlogBypassThreshold / 4));

      if (!isInFastLaneRef.current && backlog >= fastLaneEnter) {
        isInFastLaneRef.current = true;
      } else if (isInFastLaneRef.current && backlog < fastLaneExit && enabledRef.current) {
        // Don't exit fast-lane during drain (enabled=false) — keep boosting
        // until backlog is fully cleared. Hysteresis exit only applies during
        // active streaming to prevent oscillation.
        isInFastLaneRef.current = false;
      }

      if (isInFastLaneRef.current) {
        // Boost CPS proportional to backlog: more backlog = faster drain
        // Minimum 2x maxActiveCps, scales up with backlog size
        const fastCps = Math.max(
          config.maxActiveCps * 2,
          Math.min(backlog * 10, config.maxActiveCps * 20)
        );
        const fastDt = getNow() - (lastFrameTsRef.current ?? getNow());
        lastFrameTsRef.current = getNow();
        const fastDtSec = Math.max(0.001, Math.min(fastDt / 1000, 0.033));
        charAccumulatorRef.current += fastCps * fastDtSec;
        let fastReveal = Math.max(2, Math.floor(charAccumulatorRef.current));
        charAccumulatorRef.current -= fastReveal;
        if (charAccumulatorRef.current < -2) charAccumulatorRef.current = -2;
        fastReveal = Math.min(fastReveal, backlog);
        displayedCountRef.current += fastReveal;

        setDisplayedContent(targetCharsRef.current.slice(0, displayedCountRef.current).join(''));
        if (onStatsUpdate) {
          onStatsUpdate({
            backlog: targetCountRef.current - displayedCountRef.current,
            targetCount: targetCountRef.current,
            displayedCount: displayedCountRef.current,
            inputCps: emaCpsRef.current,
            outputCps: fastCps,
            pressure: smoothedPressureRef.current,
            isInFastLane: true,
          });
        }
        rafRef.current = requestAnimationFrame(tick);
        return;
      }

      const now = getNow();
      const idleMs = now - lastInputTsRef.current;
      const inputActive = idleMs <= config.activeInputWindowMs;

      // ─── Layer 1: EMA-adaptive pressure (steady state) ─────────────
      // Pure backlog-driven pressure — RC Filter already absorbs arrival jitter,
      // so chunkSizeEma and arrivalCpsEma are redundant (double-smoothing).
      const baseCps = clamp(emaCpsRef.current, config.minCps, config.maxCps);
      const baseLagChars = Math.max(1, Math.round((baseCps * config.targetBufferMs) / 1000));
      const targetLagChars = inputActive ? baseLagChars : 0;

      let pressureMultiplier: number;
      if (inputActive) {
        const backlogPressure = targetLagChars > 0 ? backlog / targetLagChars : 1;
        pressureMultiplier = clamp(backlogPressure, 1, 4.5);
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
      const activeCap = config.maxActiveCps;
      const rawCps = baseCps * pressureMultiplier * drainMultiplier;
      const currentCps = clamp(rawCps, config.minDrainCps * drainMultiplier, activeCap);

      const urgentBacklog = inputActive && targetLagChars > 0 && backlog > targetLagChars * 2.2;
      const minRevealChars = inputActive ? (urgentBacklog ? 2 : 1) : 1;

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

      // ─── CPS Clamp (Layer 3) ──────────────────────────────────────
      // Independent safety layer: never reveal more chars than available.
      // Separated from CPS formula for clarity — CPS computes "desired rate",
      // Clamp enforces "physical boundary" (backlog availability).
      // Previously targetBufferMs caused a hard stop here, creating stutter.
      // Now: soft clamp only — release as many as CPS allows, capped by backlog.
      revealChars = Math.min(revealChars, backlog);

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
        // Dirty check: skip trim+remend+setState if content unchanged
        if (nextDisplayed !== lastSetContentRef.current) {
          const trimmedContent = trimTrailingIncompleteSyntax(nextDisplayed);
          const completeContent = remend(trimmedContent, remendOptions);
          lastSetContentRef.current = completeContent;
          setDisplayedContent(completeContent);
        }
      } else {
        displayedContentRef.current = targetContentRef.current;
        displayedCountRef.current = targetCount;
        if (targetContentRef.current !== lastSetContentRef.current) {
          const trimmedContent = trimTrailingIncompleteSyntax(targetContentRef.current);
          const completeContent = remend(trimmedContent, remendOptions);
          lastSetContentRef.current = completeContent;
          setDisplayedContent(completeContent);
        }
      }

      // ─── Stats callback (debug/monitoring) ────────────────────────
      if (onStatsUpdate) {
        onStatsUpdate({
          backlog: targetCountRef.current - displayedCountRef.current,
          targetCount: targetCountRef.current,
          displayedCount: displayedCountRef.current,
          inputCps: emaCpsRef.current,
          outputCps: currentCps,
          pressure: pressureMultiplier,
          isInFastLane: false,
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [
    config.activeInputWindowMs,
    config.drainDurationMs,
    config.maxActiveCps,
    config.maxCps,
    config.minCps,
    config.targetBufferMs,
    stopFrameLoop,
  ]);
  startFrameLoopRef.current = startFrameLoop;

  useEffect(() => {
    const inputContent = safeContent;

    // When hook disabled, flush RC buffer and enter fast-lane drain.
    // Instead of syncImmediate (which causes a visible "chunk" of text),
    // we force fast-lane mode so backlog drains quickly but smoothly.
    if (!enabled) {
      // Sync target to latest content first — content and enabled may change
      // in the same render (SSE last chunk + setIsStreaming(false)), so
      // targetContentRef might be stale. We must process the delta before
      // checking backlog, otherwise we'd see backlog=0 and call syncImmediate.
      const prevTarget = targetContentRef.current;
      if (inputContent !== prevTarget) {
        if (inputContent.startsWith(prevTarget) && prevTarget.length > 0) {
          // Append (SSE tail): feed delta into targetChars, then drain.
          // Only treat as append when there's existing content — prevents
          // "" → "full content" (e.g. loading history) from triggering drain.
          const appended = inputContent.slice(prevTarget.length);
          const appendedChars = toCharArray(appended);
          targetCharsRef.current.push(...appendedChars);
          targetCountRef.current = targetCharsRef.current.length;
          targetContentRef.current = inputContent;
        } else {
          // Non-append (content replaced, e.g. switching conversations)
          // or initial load (prevTarget is empty): sync immediately.
          syncImmediate(inputContent);
          return;
        }
      }

      // Flush RC buffer — don't lose buffered chars
      if (rcBufferRef.current.length > 0) {
        targetCharsRef.current.push(...rcBufferRef.current);
        targetCountRef.current = targetCharsRef.current.length;
        rcBufferRef.current = [];
      }

      // If no backlog, nothing to drain — just sync and stop
      const currentBacklog = targetCountRef.current - displayedCountRef.current;
      if (currentBacklog <= 0) {
        syncImmediate(inputContent);
        return;
      }

      // Force fast-lane to drain remaining backlog quickly
      isInFastLaneRef.current = true;

      // Ensure RAF is running for the drain
      if (rafRef.current === null) {
        startFrameLoopRef.current();
      }
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
    // RC Arrival Jitter Filter: adaptive buffering based on network jitter.
    // CV < CV_BUFFER_THRESHOLD → passthrough (zero latency).
    // CV ≥ CV_BUFFER_THRESHOLD → buffer for RC smoothing (absorb bursts).
    const rcCv = (() => {
      const mean = rcArrivalEmaRef.current;
      const stdDev = Math.sqrt(rcArrivalVarEmaRef.current);
      return mean > 0 ? stdDev / mean : 0;
    })();
    const CV_BUFFER_THRESHOLD = 0.5;
    if (rcBufferRef.current.length === 0 && rcCv < CV_BUFFER_THRESHOLD) {
      // Stable network, no backlog — direct passthrough, zero added latency.
      targetCharsRef.current.push(...appendedChars);
      targetCountRef.current = targetCharsRef.current.length;
    } else {
      // Jittery network or existing backlog — buffer for RC smooth drain.
      rcBufferRef.current.push(...appendedChars);
    }

    // EMA tracks actual SSE arrival rate (appendedCount), not targetCount delta.
    if (appendedCount > 0) {
      const deltaMs = Math.max(1, now - lastInputTsRef.current);
      const instantCps = (appendedCount * 1000) / deltaMs;
      const clampedCps = clamp(instantCps, config.minCps, config.maxActiveCps);
      emaCpsRef.current = emaCpsRef.current * (1 - config.emaAlpha) + clampedCps * config.emaAlpha;
    }

    lastInputTsRef.current = now;

    // ─── Adaptive τ update: track arrival interval CV ──────────────
    if (appendedCount > 0 && rcLastArrivalTsRef.current > 0) {
      const interval = Math.max(1, now - rcLastArrivalTsRef.current);
      const prevMean = rcArrivalEmaRef.current;
      // Online EMA for mean and variance (Welford-like)
      rcArrivalEmaRef.current = prevMean * (1 - RC_EMA_ALPHA) + interval * RC_EMA_ALPHA;
      const delta = interval - prevMean;
      rcArrivalVarEmaRef.current =
        rcArrivalVarEmaRef.current * (1 - RC_EMA_ALPHA) + delta * delta * RC_EMA_ALPHA;
      // CV = σ/μ, clamp to avoid division by zero
      const mean = rcArrivalEmaRef.current;
      const stdDev = Math.sqrt(rcArrivalVarEmaRef.current);
      const cv = mean > 0 ? stdDev / mean : 0;
      // Map CV to τ: low CV → fast τ, high CV → smooth τ
      const targetTau = TAU_MIN + (TAU_MAX - TAU_MIN) * Math.min(cv / CV_TARGET, 1);
      // Smooth τ transition to avoid sudden jumps
      rcTauRef.current = rcTauRef.current * 0.7 + targetTau * 0.3;
    }
    if (appendedCount > 0) {
      rcLastArrivalTsRef.current = now;
    }

    startFrameLoop();
  }, [
    config.emaAlpha,
    config.largeAppendChars,
    config.maxActiveCps,
    config.maxCps,
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

  // When animation disabled, CPS still runs (controls display rate),
  // but we return displayedContent directly (same as normal path).
  // The character fade-in animation is skipped at the Single RAF Loop level.
  return displayedContent;
};
