import type { Pack } from '@unlighthouse/contracts/packs'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createLogger } from '@unlighthouse/core/logger'
import { afterEach, describe, expect, it } from 'vitest'
import { z } from 'zod'
import { testConfig } from '../../../test/helpers/contracts'
import { configuredUrls, createLocalRuntime } from '../src/local-runtime'

const tempRoots: string[] = []

function tempOutput(): string {
  const root = mkdtempSync(join(tmpdir(), 'unl-local-runtime-'))
  tempRoots.push(root)
  const outputPath = join(root, 'output')
  mkdirSync(outputPath)
  return outputPath
}

function config() {
  return testConfig({
    auditor: { name: 'mock' },
    scanner: { sitemap: false },
  })
}

function closeRuntime(runtime: Awaited<ReturnType<typeof createLocalRuntime>>): void {
  ;(runtime.storage.db as { close?: () => void } | undefined)?.close?.()
}

afterEach(() => {
  for (const root of tempRoots.splice(0))
    rmSync(root, { recursive: true, force: true })
})

describe('createLocalRuntime interface', () => {
  it('preserves output by default and returns one shared runtime graph', async () => {
    const outputPath = tempOutput()
    const sentinel = join(outputPath, 'keep.txt')
    writeFileSync(sentinel, 'keep', { encoding: 'utf8', flag: 'w' })

    const runtime = await createLocalRuntime({
      config: config(),
      output: { path: outputPath },
      logger: createLogger({ level: 0 }),
      env: {},
    })

    expect(existsSync(sentinel)).toBe(true)
    expect(runtime.handlerCtx.core).toBe(runtime.core)
    expect(runtime.handlerCtx.storage).toBe(runtime.storage)
    expect(runtime.handlerCtx.auditor).toBeDefined()
    closeRuntime(runtime)
  })

  it('resets only when requested and applies supplied packs after environment packs', async () => {
    const outputPath = tempOutput()
    const sentinel = join(outputPath, 'remove.txt')
    writeFileSync(sentinel, 'remove', { encoding: 'utf8', flag: 'w' })
    const customCrux: Pack = {
      name: 'crux',
      description: 'test override',
      version: 'test',
      reportSchema: z.object({ source: z.literal('test') }),
      reconciler: async () => ({ source: 'test' as const }),
      ui: { tab: 'test' },
    }

    const runtime = await createLocalRuntime({
      config: config(),
      output: { path: outputPath, mode: 'reset' },
      logger: createLogger({ level: 0 }),
      env: { CRUX_API_KEY: 'environment-key' },
      packs: [customCrux],
    })

    expect(existsSync(sentinel)).toBe(false)
    expect(runtime.handlerCtx.packs?.get('crux')).toBe(customCrux)
    closeRuntime(runtime)
  })
})

describe('configuredUrls', () => {
  it('resolves relative explicit paths, removes duplicates, and does not add the site', () => {
    const urls = configuredUrls(testConfig({
      site: 'https://example.com',
      urls: ['/about', ' /about ', '/pricing'],
    }))

    expect(urls).toEqual([
      'https://example.com/about',
      'https://example.com/pricing',
    ])
  })

  it('resolves URLs returned by an async provider', async () => {
    const urls = configuredUrls(testConfig({
      site: 'https://example.com',
      urls: async () => ['/docs', '/docs', 'https://other.example/contact'],
    }))

    expect(typeof urls).toBe('function')
    await expect((urls as () => Promise<string[]>)()).resolves.toEqual([
      'https://example.com/docs',
      'https://other.example/contact',
    ])
  })
})
