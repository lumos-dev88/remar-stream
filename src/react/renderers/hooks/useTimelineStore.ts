import { useRef, useSyncExternalStore } from 'react';

/** Notify every N frames — frame-counting throttle works at any frame rate */
const TIMELINE_NOTIFY_EVERY_N_FRAMES = 2;

interface TimelineStore {
  timeline: number;
  listeners: Set<() => void>;
  frameCount: number;
  setTimeline(value: number): void;
}

/**
 * Custom hook to manage timeline state using useSyncExternalStore
 * This avoids frequent re-renders caused by React state updates
 *
 * Throttling: Frame-counting approach — notify every N frames instead of
 * delta-based threshold. Delta-based throttle (e.g., threshold=20ms) is
 * completely ineffective at stable 60Hz because each frame delta (~16.67ms)
 * is always below the threshold. Frame counting guarantees consistent
 * ~30Hz notification at 60Hz, ~30Hz at 120Hz (every 2nd frame), etc.
 */
export function useTimelineStore() {
  const storeRef = useRef<TimelineStore>({
    timeline: 0,
    listeners: new Set(),
    frameCount: 0,
    setTimeline(value: number) {
      this.timeline = value;
      this.frameCount++;
      // Notify every N frames — consistent throttle at any frame rate
      if (this.frameCount % TIMELINE_NOTIFY_EVERY_N_FRAMES === 0) {
        this.listeners.forEach(listener => listener());
      }
    },
  });

  // Stable subscribe function — avoids re-subscribing on every render
  // useSyncExternalStore re-subscribes when the subscribe function reference changes
  const subscribeRef = useRef<(callback: () => void) => () => void>();
  if (!subscribeRef.current) {
    subscribeRef.current = (callback: () => void) => {
      const store = storeRef.current;
      store.listeners.add(callback);
      return () => store.listeners.delete(callback);
    };
  }

  // Subscribe to timeline changes using React 18's useSyncExternalStore
  useSyncExternalStore(
    subscribeRef.current,
    () => storeRef.current.timeline,
    () => storeRef.current.timeline // SSR initial value
  );

  return storeRef;
}
