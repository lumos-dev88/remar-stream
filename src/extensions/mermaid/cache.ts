/**
 * Mermaid diagram caching system
 *
 * Used to cache rendered Mermaid SVGs to avoid re-rendering identical diagrams
 * Supports cache key generation based on diagram content and options
 */

export interface MermaidCacheEntry {
  svg: string;
  timestamp: number;
  hitCount: number;
}

export interface MermaidCacheOptions {
  maxSize?: number;
  ttl?: number;
}

export class MermaidBucketCache {
  private cache = new Map<string, MermaidCacheEntry>();
  private readonly maxSize: number;
  private readonly ttl: number;

  constructor(options: MermaidCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.ttl = options.ttl ?? 5 * 60 * 1000;
  }

  /**
   * Generate cache key
   * Based on diagram content and configuration options
   */
  getCacheKey(content: string, options?: Record<string, any>): string {
    const optionsStr = options ? JSON.stringify(options) : '';
    const combined = `${content}:${optionsStr}`;

    // Simple hash implementation
    let hash = 0;
    for (let i = 0; i < combined.length; i++) {
      const char = combined.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get cached SVG
   */
  get(key: string): string | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;

    // Check if expired
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      return undefined;
    }

    entry.hitCount++;
    return entry.svg;
  }

  /**
   * Set cache
   */
  set(key: string, svg: string): void {
    // If full, delete oldest entry
    if (this.cache.size >= this.maxSize) {
      const oldestKey = this.findOldestKey();
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      svg,
      timestamp: Date.now(),
      hitCount: 0,
    });
  }

  private findOldestKey(): string | undefined {
    let oldestKey: string | undefined;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    return oldestKey;
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }

  get stats(): { size: number; totalHits: number } {
    let totalHits = 0;
    for (const entry of this.cache.values()) {
      totalHits += entry.hitCount;
    }
    return {
      size: this.cache.size,
      totalHits,
    };
  }
}

export const mermaidCache = new MermaidBucketCache();

export default mermaidCache;
