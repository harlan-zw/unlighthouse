import type { LighthouseScanOptions, LighthouseScanResult } from './lighthouse'
import objectHash from 'object-hash'

export interface CachedResult {
  result: LighthouseScanResult
  cachedAt: number
  expiresAt: number
  hits: number
}

export interface CacheStats {
  size: number
  hits: number
  misses: number
  hitRate: number
  oldestEntry: number | null
  newestEntry: number | null
}

/**
 * LRU cache for Lighthouse scan results with TTL support.
 * Helps reduce redundant scans and improve response times.
 */
export class ResultCache {
  private cache: Map<string, CachedResult> = new Map()
  private maxSize: number
  private defaultTTL: number
  private hits = 0
  private misses = 0

  constructor(maxSize: number = 1000, defaultTTL: number = 60 * 60 * 1000) {
    this.maxSize = maxSize
    this.defaultTTL = defaultTTL

    // Clean up expired entries periodically
    setInterval(() => {
      this.cleanup()
    }, 5 * 60 * 1000) // Every 5 minutes
  }

  /**
   * Generate a cache key from scan options
   */
  private getCacheKey(options: LighthouseScanOptions): string {
    // Create a stable hash of the options
    const normalized = {
      url: options.url.toLowerCase().trim(),
      categories: options.categories?.sort() || [],
      formFactor: options.formFactor || 'mobile',
      throttling: options.throttling || 'mobile4G',
    }
    return objectHash(normalized)
  }

  /**
   * Get a cached result if available and not expired
   */
  get(options: LighthouseScanOptions): LighthouseScanResult | null {
    const key = this.getCacheKey(options)
    const cached = this.cache.get(key)

    if (!cached) {
      this.misses++
      return null
    }

    // Check if expired
    if (Date.now() > cached.expiresAt) {
      this.cache.delete(key)
      this.misses++
      return null
    }

    // Update LRU - move to end
    this.cache.delete(key)
    cached.hits++
    this.cache.set(key, cached)
    this.hits++

    return cached.result
  }

  /**
   * Store a result in the cache
   */
  set(
    options: LighthouseScanOptions,
    result: LighthouseScanResult,
    ttl: number = this.defaultTTL,
  ): void {
    const key = this.getCacheKey(options)
    const now = Date.now()

    const cached: CachedResult = {
      result,
      cachedAt: now,
      expiresAt: now + ttl,
      hits: 0,
    }

    // Remove if exists (to update position in LRU)
    this.cache.delete(key)

    // Add to cache
    this.cache.set(key, cached)

    // Evict oldest if over max size
    if (this.cache.size > this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }
  }

  /**
   * Check if a result is cached and valid
   */
  has(options: LighthouseScanOptions): boolean {
    return this.get(options) !== null
  }

  /**
   * Invalidate cache for specific options
   */
  invalidate(options: LighthouseScanOptions): boolean {
    const key = this.getCacheKey(options)
    return this.cache.delete(key)
  }

  /**
   * Invalidate all cache entries for a URL (regardless of other options)
   */
  invalidateUrl(url: string): number {
    const normalizedUrl = url.toLowerCase().trim()
    let deleted = 0

    for (const [key, cached] of this.cache.entries()) {
      if (cached.result.url.toLowerCase().includes(normalizedUrl)) {
        this.cache.delete(key)
        deleted++
      }
    }

    return deleted
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  /**
   * Remove expired entries
   */
  private cleanup(): void {
    const now = Date.now()
    const toDelete: string[] = []

    for (const [key, cached] of this.cache.entries()) {
      if (now > cached.expiresAt) {
        toDelete.push(key)
      }
    }

    for (const key of toDelete) {
      this.cache.delete(key)
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entries = Array.from(this.cache.values())
    const times = entries.map(e => e.cachedAt)

    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: this.hits + this.misses > 0
        ? this.hits / (this.hits + this.misses)
        : 0,
      oldestEntry: times.length > 0 ? Math.min(...times) : null,
      newestEntry: times.length > 0 ? Math.max(...times) : null,
    }
  }

  /**
   * Get all cached URLs (for debugging)
   */
  getCachedUrls(): string[] {
    return Array.from(this.cache.values()).map(c => c.result.url)
  }
}

// Singleton instance
let resultCache: ResultCache | null = null

export function getResultCache(): ResultCache {
  if (!resultCache) {
    // Cache up to 1000 results, 1 hour TTL
    resultCache = new ResultCache(1000, 60 * 60 * 1000)
  }
  return resultCache
}
