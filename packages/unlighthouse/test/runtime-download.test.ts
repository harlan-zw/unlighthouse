import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { downloadRuntimePackages } from '../src/runtime-download'

async function installFixture(directory: string) {
  const root = join(directory, 'node_modules', 'fixture-engine')
  await mkdir(root, { recursive: true })
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'fixture-engine', version: '1.0.0', type: 'module', main: './index.ts' }))
  await writeFile(join(root, 'index.ts'), 'export const audit = (url: string) => ({ url, score: 1 })\n')
}

it('shares concurrent installs and reuses the cache across loader calls', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'unlighthouse-download-'))
  let installs = 0
  const install = async (directory: string) => {
    installs++
    await setTimeout(30)
    await installFixture(directory)
  }
  try {
    const options = { cacheDir, install }
    const [first, second] = await Promise.all([
      downloadRuntimePackages({ 'fixture-engine': '1.0.0' }, options),
      downloadRuntimePackages({ 'fixture-engine': '1.0.0' }, options),
    ])
    const third = await downloadRuntimePackages({ 'fixture-engine': '1.0.0' }, options)
    expect(installs).toBe(1)
    for (const resolve of [first, second, third]) {
      const engine = await import(resolve('fixture-engine'))
      expect(engine.audit('https://example.com')).toEqual({ url: 'https://example.com', score: 1 })
    }
  }
  finally {
    await rm(cacheDir, { recursive: true, force: true })
  }
})

it('retries a failed installation without reusing its partial output', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'unlighthouse-download-'))
  let installs = 0
  const install = async (directory: string) => {
    installs++
    await installFixture(directory)
    if (installs === 1)
      throw new Error('Network unavailable')
  }
  try {
    await expect(downloadRuntimePackages({ 'fixture-engine': '1.0.0' }, { cacheDir, install })).rejects.toThrow('Network unavailable')
    const resolve = await downloadRuntimePackages({ 'fixture-engine': '1.0.0' }, { cacheDir, install })
    expect((await import(resolve('fixture-engine'))).audit('retry').score).toBe(1)
    expect(installs).toBe(2)
  }
  finally {
    await rm(cacheDir, { recursive: true, force: true })
  }
})

it('does not publish an aborted install and permits a later retry', async () => {
  const cacheDir = await mkdtemp(join(tmpdir(), 'unlighthouse-download-'))
  const controller = new AbortController()
  try {
    await expect(downloadRuntimePackages({ 'fixture-engine': '1.0.0' }, {
      cacheDir,
      signal: controller.signal,
      install: async (directory) => {
        await installFixture(directory)
        controller.abort(new Error('Scan cancelled'))
      },
    })).rejects.toThrow('Scan cancelled')
    const resolve = await downloadRuntimePackages({ 'fixture-engine': '1.0.0' }, { cacheDir, install: installFixture })
    expect((await import(resolve('fixture-engine'))).audit('retry').url).toBe('retry')
  }
  finally {
    await rm(cacheDir, { recursive: true, force: true })
  }
})

it('rejects unpinned or invalid package specifications before installing', async () => {
  await expect(downloadRuntimePackages({ lighthouse: '^13.4.1' })).rejects.toThrow('Invalid dependency pin')
  await expect(downloadRuntimePackages({ '--script': '1.0.0' })).rejects.toThrow('Invalid dependency pin')
})
