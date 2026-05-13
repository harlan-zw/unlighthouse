import type { Seed } from '../types/atoms'

export type { Seed }

export interface SeedSource {
  seeds: () => AsyncIterable<Seed>
}
