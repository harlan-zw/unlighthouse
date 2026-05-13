import type { SeedSource } from '@unlighthouse/contracts/ports'

/**
 * Fuse multiple SeedSource streams into one. Yields seeds from each source in order.
 * Deduplication is the responsibility of downstream consumers (Crawler).
 */
export function fuseSeeds(sources: SeedSource[]): SeedSource {
  return {
    async* seeds() {
      for (const src of sources)
        yield* src.seeds()
    },
  }
}
