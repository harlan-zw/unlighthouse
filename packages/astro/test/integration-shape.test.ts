// Shape-only tests — no real Astro build, no real Unlighthouse scan.
// Verifies the integration factory returns an Astro-shaped object with
// the hooks the build-time integration relies on.

import { describe, expect, it } from 'vitest'
import { unlighthouseAstro } from '../src/index'

describe('@unlighthouse/astro — integration shape', () => {
  it('returns an astro integration object with the expected name + hooks', () => {
    const integration = unlighthouseAstro()
    expect(integration).toBeTypeOf('object')
    expect(integration.name).toBe('@unlighthouse/astro')
    expect(integration.hooks).toBeTypeOf('object')
    expect(integration.hooks['astro:build:done']).toBeTypeOf('function')
  })

  it('accepts an options bag without throwing', () => {
    const integration = unlighthouseAstro({
      site: 'https://example.com',
      outputPath: 'dist/unlighthouse-report',
      block: true,
      enableOnBuild: false,
      unlighthouse: { debug: true },
    })
    expect(integration.name).toBe('@unlighthouse/astro')
  })

  it('is a no-op on astro:build:done when enableOnBuild is false', async () => {
    const integration = unlighthouseAstro({ enableOnBuild: false })
    // Call the hook directly. With `enableOnBuild: false` it should
    // return without touching unlighthouse — so no error, no async
    // dynamic-import attempts.
    const hook = integration.hooks['astro:build:done']
    await expect(hook({
      dir: new URL('file:///tmp/does-not-matter/'),
      routes: [],
      pages: [],
    })).resolves.toBeUndefined()
  })

  it('honours UNLIGHTHOUSE_SKIP=true env opt-out', async () => {
    const prev = process.env.UNLIGHTHOUSE_SKIP
    process.env.UNLIGHTHOUSE_SKIP = 'true'
    try {
      const integration = unlighthouseAstro()
      const hook = integration.hooks['astro:build:done']
      // Skips before any dynamic import / preview server.
      await expect(hook({
        dir: new URL('file:///tmp/does-not-matter/'),
        routes: [],
        pages: [],
      })).resolves.toBeUndefined()
    }
    finally {
      if (prev === undefined)
        delete process.env.UNLIGHTHOUSE_SKIP
      else
        process.env.UNLIGHTHOUSE_SKIP = prev
    }
  })

  it('default export matches the named export', async () => {
    const mod = await import('../src/index')
    expect(mod.default).toBe(mod.unlighthouseAstro)
  })
})
