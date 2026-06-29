import type { SeedSource } from '@unlighthouse/contracts/ports'
import { fuseSeeds, manualSeeds } from '@unlighthouse/core/seeds'
import { describe, expect, it } from 'vitest'

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
