import type { Seed, SeedSource } from '@unlighthouse/contracts/ports'

/**
 * Generic SeedSource composers. None of these know what a "tenant" or
 * "blocklist" is — hosts supply the predicate / transform.
 */

/**
 * Concatenate multiple sources in order. Duplicates are emitted as-is; pair
 * with `dedupeSeedSource` if you care.
 */
export function mergeSeedSources(...sources: SeedSource[]): SeedSource {
  return {
    async* seeds() {
      for (const src of sources)
        yield* src.seeds()
    },
  }
}

/** Drop seeds for which `predicate(seed)` returns false. */
export function filterSeedSource(source: SeedSource, predicate: (seed: Seed) => boolean | Promise<boolean>): SeedSource {
  return {
    async* seeds() {
      for await (const seed of source.seeds()) {
        if (await predicate(seed))
          yield seed
      }
    },
  }
}

/** Transform each seed. Return `null`/`undefined` to drop. */
export function mapSeedSource(source: SeedSource, transform: (seed: Seed) => Seed | null | undefined | Promise<Seed | null | undefined>): SeedSource {
  return {
    async* seeds() {
      for await (const seed of source.seeds()) {
        const out = await transform(seed)
        if (out != null)
          yield out
      }
    },
  }
}

/**
 * Suppress repeat URLs. `key(seed)` defaults to `seed.url`; pass a custom
 * key fn for normalization (e.g. drop query strings, lowercase host).
 */
export function dedupeSeedSource(source: SeedSource, key: (seed: Seed) => string = s => s.url): SeedSource {
  return {
    async* seeds() {
      const seen = new Set<string>()
      for await (const seed of source.seeds()) {
        const k = key(seed)
        if (seen.has(k))
          continue
        seen.add(k)
        yield seed
      }
    },
  }
}
