// Shape-only tests — no real Next build, no real Unlighthouse scan.
// Verifies the HOC factory returns a NextConfig-shaped object, preserves
// user fields, chains the user's webpack hook, and only attaches the
// `done` tap under the right conditions.

import process from 'node:process'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { withUnlighthouse } from '../src/index'

interface FakeHook { tap: ReturnType<typeof vi.fn> }
interface FakeCompiler { hooks: { done: FakeHook } }

function makeFakeCompiler(): FakeCompiler {
  return { hooks: { done: { tap: vi.fn() } } }
}

describe('@unlighthouse/next — withUnlighthouse HOC shape', () => {
  const originalEnv = process.env.NODE_ENV
  const originalSkip = process.env.UNLIGHTHOUSE_SKIP

  beforeEach(() => {
    // Vitest types NODE_ENV as readonly; the cast is local-only.
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'production'
    delete process.env.UNLIGHTHOUSE_SKIP
  })

  afterEach(() => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = originalEnv
    if (originalSkip === undefined)
      delete process.env.UNLIGHTHOUSE_SKIP
    else
      process.env.UNLIGHTHOUSE_SKIP = originalSkip
  })

  it('returns a NextConfig with a webpack hook attached', () => {
    const wrapped = withUnlighthouse({ reactStrictMode: true })
    expect(wrapped.reactStrictMode).toBe(true)
    expect(wrapped.webpack).toBeTypeOf('function')
  })

  it('preserves arbitrary user config fields', () => {
    const wrapped = withUnlighthouse({
      reactStrictMode: true,
      images: { domains: ['example.com'] },
      experimental: { typedRoutes: true },
    } as Record<string, unknown>)
    expect((wrapped as Record<string, unknown>).reactStrictMode).toBe(true)
    expect((wrapped as Record<string, unknown>).images).toEqual({ domains: ['example.com'] })
    expect((wrapped as Record<string, unknown>).experimental).toEqual({ typedRoutes: true })
  })

  it('chains an existing user webpack hook (user runs first, result passed through)', () => {
    const userWebpack = vi.fn((config: unknown) => ({ ...(config as object), userMark: true }))
    const wrapped = withUnlighthouse({ webpack: userWebpack })
    const compiler = makeFakeCompiler()
    // dev: true means the unlighthouse tap is skipped — but the user
    // hook should still run and its return value must be propagated.
    const result = wrapped.webpack(compiler, { isServer: false, dev: true }) as Record<string, unknown>
    expect(userWebpack).toHaveBeenCalledTimes(1)
    expect(result.userMark).toBe(true)
  })

  it('attaches done.tap only for client production builds', () => {
    const wrapped = withUnlighthouse({})

    const clientProd = makeFakeCompiler()
    wrapped.webpack(clientProd, { isServer: false, dev: false, buildId: 'a' })
    expect(clientProd.hooks.done.tap).toHaveBeenCalledTimes(1)

    const serverProd = makeFakeCompiler()
    wrapped.webpack(serverProd, { isServer: true, dev: false, buildId: 'b' })
    expect(serverProd.hooks.done.tap).not.toHaveBeenCalled()

    const clientDev = makeFakeCompiler()
    wrapped.webpack(clientDev, { isServer: false, dev: true, buildId: 'c' })
    expect(clientDev.hooks.done.tap).not.toHaveBeenCalled()
  })

  it('skips the tap when UNLIGHTHOUSE_SKIP=true', () => {
    process.env.UNLIGHTHOUSE_SKIP = 'true'
    const wrapped = withUnlighthouse({})
    const compiler = makeFakeCompiler()
    wrapped.webpack(compiler, { isServer: false, dev: false, buildId: 'skip' })
    expect(compiler.hooks.done.tap).not.toHaveBeenCalled()
  })

  it('skips the tap when NODE_ENV is not production', () => {
    ;(process.env as Record<string, string | undefined>).NODE_ENV = 'test'
    const wrapped = withUnlighthouse({})
    const compiler = makeFakeCompiler()
    wrapped.webpack(compiler, { isServer: false, dev: false, buildId: 'nonprod' })
    expect(compiler.hooks.done.tap).not.toHaveBeenCalled()
  })

  it('honours enableOnBuild: false', () => {
    const wrapped = withUnlighthouse({}, { enableOnBuild: false })
    const compiler = makeFakeCompiler()
    wrapped.webpack(compiler, { isServer: false, dev: false, buildId: 'disabled' })
    expect(compiler.hooks.done.tap).not.toHaveBeenCalled()
  })

  it('dedupes repeated webpack(config) calls for the same buildId', () => {
    const wrapped = withUnlighthouse({})
    const compilerA = makeFakeCompiler()
    const compilerB = makeFakeCompiler()
    wrapped.webpack(compilerA, { isServer: false, dev: false, buildId: 'dup' })
    wrapped.webpack(compilerB, { isServer: false, dev: false, buildId: 'dup' })
    expect(compilerA.hooks.done.tap).toHaveBeenCalledTimes(1)
    expect(compilerB.hooks.done.tap).not.toHaveBeenCalled()
  })

  it('default export matches the named export', async () => {
    const mod = await import('../src/index')
    expect(mod.default).toBe(mod.withUnlighthouse)
  })
})
