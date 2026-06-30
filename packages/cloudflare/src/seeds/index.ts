import type { SeedSource } from '@unlighthouse/contracts/ports'
import type { Seed } from '@unlighthouse/contracts/types/atoms'

export * from './sitemap'

/**
 * Fuse multiple SeedSources into one, dropping URLs already yielded.
 *
 * The Worker crawlers (cloudflare-crawl, parallel-map) audit every seed they
 * receive with no request-queue dedup of their own (unlike crawlee locally),
 * and `manualSeeds([site])` overlaps the site root that `workerSitemapSeeds`
 * also emits. Dedup here so the homepage isn't audited twice per scan.
 */
export function fuseSeedsDedup(sources: SeedSource[]): SeedSource {
  return {
    async* seeds(): AsyncIterable<Seed> {
      const seen = new Set<string>()
      for (const src of sources) {
        for await (const seed of src.seeds()) {
          if (seen.has(seed.url))
            continue
          seen.add(seed.url)
          yield seed
        }
      }
    },
  }
}
