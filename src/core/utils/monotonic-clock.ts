/**
 * MonotonicClock — 抗暂停单调时钟
 *
 * 基于 performance.now()，提供 freeze/thaw 机制。
 * 解决 RAF timestamp 在页面 hidden 时跳跃的问题。
 *
 * 使用场景：
 * - 动画波前计算：waveFrontMs = clock.now() - firstBlockStartTime
 * - visibilitychange 时冻结，恢复后从冻结点继续，无跳跃
 *
 * [Design]
 * - origin: 创建时刻的 performance.now() 值
 * - totalFrozen: 累计冻结时长
 * - frozenAt: 当前冻结开始时刻（null 表示未冻结）
 * - now() = performance.now() - origin - totalFrozen
 *
 * [Example]
 * ```
 * const clock = new MonotonicClock();
 * clock.now(); // → 0
 * // ... 1000ms later
 * clock.now(); // → 1000
 * clock.freeze();
 * // ... 5000ms later (page hidden)
 * clock.now(); // → 1000 (frozen)
 * clock.thaw();
 * clock.now(); // → 1000 (no jump)
 * // ... 100ms later
 * clock.now(); // → 1100 (continues from freeze point)
 * ```
 */

export class MonotonicClock {
  private origin: number;
  private frozenAt: number | null = null;
  private totalFrozen: number = 0;

  constructor(now: number = performance.now()) {
    this.origin = now;
  }

  /** 获取当前单调时间（冻结期间返回冻结时刻的值） */
  now(): number {
    if (this.frozenAt !== null) {
      return this.frozenAt - this.origin - this.totalFrozen;
    }
    return performance.now() - this.origin - this.totalFrozen;
  }

  /** 冻结时钟（模拟 visibilitychange hidden） */
  freeze(): void {
    if (this.frozenAt === null) {
      this.frozenAt = performance.now();
    }
  }

  /** 解冻时钟（模拟 visibilitychange visible） */
  thaw(): void {
    if (this.frozenAt !== null) {
      this.totalFrozen += performance.now() - this.frozenAt;
      this.frozenAt = null;
    }
  }

  /** 是否处于冻结状态 */
  isFrozen(): boolean {
    return this.frozenAt !== null;
  }

  /** 重置时钟（用于测试或完全重新开始） */
  reset(now: number = performance.now()): void {
    this.origin = now;
    this.frozenAt = null;
    this.totalFrozen = 0;
  }
}

// ─── 全局单例 ──────────────────────────────────────────────────────
// 动画系统使用单一时钟实例，确保所有组件时间一致

let globalClock: MonotonicClock | null = null;

/**
 * 获取全局动画时钟单例
 *
 * 首次调用时创建，后续调用返回同一实例。
 * visibilitychange 时自动 freeze/thaw。
 */
export function getAnimationClock(): MonotonicClock {
  if (!globalClock) {
    globalClock = new MonotonicClock();

    // 自动处理 visibilitychange
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', () => {
        if (!globalClock) return;
        if (document.visibilityState === 'hidden') {
          globalClock.freeze();
        } else {
          globalClock.thaw();
        }
      });
    }
  }
  return globalClock;
}

/**
 * 重置全局时钟（用于测试或 HMR）
 */
export function resetAnimationClock(): void {
  globalClock = null;
}
