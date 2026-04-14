/**
 * useBodyScrollLock - Reference-counted body scroll lock
 *
 * Supports nested fullscreen overlays by tracking active lock count.
 * Only unlocks when all locks are released.
 *
 * Usage:
 *   const lock = useBodyScrollLock();
 *   lock();    // increment → lock body
 *   unlock();  // decrement → unlock when count reaches 0
 */

let activeCount = 0;
let originalOverflow = '';

export function useBodyScrollLock() {
  const lock = () => {
    if (activeCount === 0) {
      originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    activeCount += 1;
  };

  const unlock = () => {
    activeCount = Math.max(0, activeCount - 1);
    if (activeCount === 0) {
      document.body.style.overflow = originalOverflow;
    }
  };

  return { lock, unlock };
}

/** Reset lock state (for testing / cleanup) */
export function resetScrollLock() {
  activeCount = 0;
  document.body.style.overflow = originalOverflow;
}
