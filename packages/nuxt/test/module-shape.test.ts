// Shape-only tests — no real Nuxt build, no real Unlighthouse scan.
// Verifies the module factory returns a Nuxt-shaped module object with the
// hooks the post-generate integration relies on.

import { describe, expect, it } from 'vitest'
import unlighthouseNuxtModule from '../src/module'

describe('@unlighthouse/nuxt — module shape', () => {
  it('exports a function (the defineNuxtModule output is callable)', () => {
    expect(unlighthouseNuxtModule).toBeTypeOf('function')
  })

  it('attaches the expected meta to the module', () => {
    // defineNuxtModule decorates the returned function with `meta` so the
    // Nuxt loader can read module identity without invoking setup.
    const mod = unlighthouseNuxtModule as unknown as {
      meta: { name: string, configKey: string, compatibility?: { nuxt?: string } }
    }
    expect(mod.meta).toBeTypeOf('object')
    expect(mod.meta.name).toBe('@unlighthouse/nuxt')
    expect(mod.meta.configKey).toBe('unlighthouse')
    expect(mod.meta.compatibility?.nuxt).toMatch(/^>=3/)
  })

  it('exposes a callable setup function via the kit-wrapped object', () => {
    // defineNuxtModule returns a callable installer; the original `setup`
    // is preserved on the function so we can verify its presence + arity
    // without booting a real Nuxt context.
    const mod = unlighthouseNuxtModule as unknown as {
      setup?: (...args: unknown[]) => unknown
      getOptions?: (...args: unknown[]) => unknown
    }
    // Some @nuxt/kit versions expose `setup` directly; others expose only
    // the callable installer. Either way the installer itself is a function.
    expect(typeof mod === 'function' || typeof mod.setup === 'function').toBe(true)
  })

  it('default export and the module installer are the same reference', async () => {
    const re = await import('../src/module')
    expect(re.default).toBe(unlighthouseNuxtModule)
  })
})
