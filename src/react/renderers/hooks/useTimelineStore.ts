import { useRef, useSyncExternalStore } from 'react';

interface TimelineStore {
  timeline: number;
  listeners: Set<() => void>;
  setTimeline(value: number): void;
}

/**
 * Custom hook to manage timeline state using useSyncExternalStore
 * This avoids frequent re-renders caused by React state updates
 */
export function useTimelineStore() {
  const storeRef = useRef<TimelineStore>({
    timeline: 0,
    listeners: new Set(),
    setTimeline(value: number) {
      this.timeline = value;
      this.listeners.forEach(listener => listener());
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
