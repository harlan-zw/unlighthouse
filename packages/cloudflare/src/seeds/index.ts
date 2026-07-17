import type { SeedSource } from '@unlighthouse/contracts/ports'
import type { Seed } from '@unlighthouse/contracts/types/atoms'

export * from './sitemap'

/**
 * Fuse multiple SeedSources into one, dropping URLs already yielded.
 *
 * Finite-seed consumers do not have Crawlee's request-queue deduplication, and
 * `manualSeeds([site])` overlaps the site root that `workerSitemapSeeds` also
 * emits. Dedup here so the homepage is not audited twice per scan.
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
