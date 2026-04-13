import type { CacheEntry } from './types'

/**
 * Formula rendering cache manager
 *
 * Core Features:
 * - Cache rendered formula HTML to avoid re-rendering
 * - LRU eviction policy to control memory usage
 * - Support manual cleanup and automatic expiration
 */
class FormulaCache {
  private cache = new Map<string, CacheEntry>()
  private maxSize: number
  private ttlMs: number

  constructor(maxSize = 1000, ttlMs = 1000 * 60 * 30) {
    this.maxSize = maxSize
    this.ttlMs = ttlMs
  }

  /**
   * Get cached render result
   */
  get(content: string, displayMode = false): string | undefined {
    const key = this.getKey(content, displayMode)
    const entry = this.cache.get(key)

    if (!entry) return undefined

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key)
      return undefined
    }

    // Update access count
    entry.accessCount++
    return entry.html
  }

  /**
   * Set cache
   */
  set(content: string, html: string, displayMode = false): void {
    const key = this.getKey(content, displayMode)

    // If cache is full, evict least recently used
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictLRU()
    }

    this.cache.set(key, {
      html,
      timestamp: Date.now(),
      accessCount: 1,
    })
  }

  /**
   * Check if has cache
   */
  has(content: string, displayMode = false): boolean {
    const key = this.getKey(content, displayMode)
    return this.cache.has(key)
  }

  /**
   * Clear cache
   */
  clear(): void {
    this.cache.clear()
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size
  }

  private getKey(content: string, displayMode: boolean): string {
    return `${displayMode ? 'block' : 'inline'}:${content}`
  }

  private evictLRU(): void {
    let minAccessCount = Infinity;
    let minKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < minAccessCount ||
          (entry.accessCount === minAccessCount && entry.timestamp < oldestTime)) {
        minAccessCount = entry.accessCount
        minKey = key
        oldestTime = entry.timestamp
      }
    }

    if (minKey) {
      this.cache.delete(minKey)
    }
  }
}

export const formulaCache = new FormulaCache()

export function getCachedFormula(content: string, displayMode = false): string | undefined {
  return formulaCache.get(content, displayMode)
}

export function setCachedFormula(content: string, html: string, displayMode = false): void {
  formulaCache.set(content, html, displayMode)
}

export function clearFormulaCache(): void {
  formulaCache.clear()
}
