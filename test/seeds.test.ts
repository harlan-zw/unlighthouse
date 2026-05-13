import type { SeedSource } from '../packages/contracts/src/ports/seed-source'
import { describe, expect, it } from 'vitest'
import { fuseSeeds } from '../packages/core/src/seeds/fuse'
import { manualSeeds } from '../packages/core/src/seeds/manual'

async function collect(src: SeedSource): Promise<string[]> {
  const out: string[] = []
  for await (const s of src.seeds())
    out.push(s.url)
  return out
}

describe('manualSeeds', () => {
  it('yields exactly provided urls', async () => {
    const src = manualSeeds({ urls: ['/a', '/b'] })
    expect(await collect(src)).toEqual(['/a', '/b'])
  })

  it('accepts a thunk that returns urls', async () => {
    const src = manualSeeds({ urls: () => ['/x', '/y', '/z'] })
    expect(await collect(src)).toEqual(['/x', '/y', '/z'])
  })
})

describe('fuseSeeds', () => {
  it('yields seeds from each source in order (no dedupe — caller responsibility)', async () => {
    const a = manualSeeds({ urls: ['/x', '/y'] })
    const b = manualSeeds({ urls: ['/y', '/z'] })
    const fused = fuseSeeds([a, b])
    const got = await collect(fused)
    expect(got).toEqual(['/x', '/y', '/y', '/z'])
    // unique projection — what downstream Crawler is expected to produce
    expect(Array.from(new Set(got))).toEqual(['/x', '/y', '/z'])
  })
})
