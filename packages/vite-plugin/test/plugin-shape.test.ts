// Shape-only tests — no real Vite build, no real Unlighthouse scan.
// Verifies the plugin factory returns a Vite-shaped plugin object with the
// hooks the build-time integration relies on.

import { describe, expect, it } from 'vitest'
import { unlighthouseVite } from '../src/index'

describe('@unlighthouse/vite — plugin shape', () => {
  it('returns a vite plugin object with the expected name + hooks', () => {
    const plugin = unlighthouseVite()
    expect(plugin).toBeTypeOf('object')
    expect(plugin.name).toBe('unlighthouse:vite')
    expect(plugin.apply).toBe('build')
    expect(plugin.configResolved).toBeTypeOf('function')
    expect(plugin.closeBundle).toBeTypeOf('function')
  })

  it('accepts an options bag without throwing', () => {
    const plugin = unlighthouseVite({
      site: 'https://example.com',
      outputPath: 'dist/unlighthouse-report',
      block: true,
      enableOnBuild: false,
      unlighthouse: { debug: true },
    })
    expect(plugin.name).toBe('unlighthouse:vite')
  })

  it('is a no-op on closeBundle when enableOnBuild is false', async () => {
    const plugin = unlighthouseVite({ enableOnBuild: false })
    // Call the hook directly. With `enableOnBuild: false` it should
    // return without touching vite/unlighthouse — so no error, no async
    // dynamic-import attempts.
    const close = plugin.closeBundle as () => Promise<void>
    await expect(close()).resolves.toBeUndefined()
  })

  it('default export matches the named export', async () => {
    const mod = await import('../src/index')
    expect(mod.default).toBe(mod.unlighthouseVite)
  })
})
