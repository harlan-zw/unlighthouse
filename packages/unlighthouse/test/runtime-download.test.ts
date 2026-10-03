import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout } from 'node:timers/promises'
import { expect, it } from 'vitest'
import { downloadRuntimePackages } from '../src/runtime-download'

it('runs library audits without installing unused upstream error reporting', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-telemetry-'))
  const engine = join(root, 'engine')
  await mkdir(engine)
  await writeFile(join(engine, 'package.json'), JSON.stringify({ name: 'lighthouse', version: '1.0.0', type: 'module', main: 'index.mjs', dependencies: { '@sentry/node': '^10.0.0' } }))
  await writeFile(join(engine, 'index.mjs'), 'export const audit = url => ({ url, score: 1 }); export const telemetry = () => import("@sentry/node")\n')
  const npm = (args: string[], directory: string) => new Promise<void>((resolve, reject) => {
    const child = spawn('npm', args, { cwd: directory, stdio: 'pipe' })
    let output = ''
    child.stderr.on('data', chunk => output += String(chunk))
    child.once('error', reject)
    child.once('close', code => code === 0 ? resolve() : reject(new Error(output)))
  })
  const registry = createServer()
  try {
    await npm(['pack', '--offline', '--ignore-scripts', '--pack-destination', root], engine)
    const tarball = await readFile(join(root, 'lighthouse-1.0.0.tgz'))
    await new Promise<void>(resolve => registry.listen(0, '127.0.0.1', resolve))
    const address = registry.address()
    if (!address || typeof address === 'string')
      throw new Error('Missing fixture registry address')
    const origin = `http://127.0.0.1:${address.port}`
    registry.on('request', (request, response) => {
      if (request.url === '/lighthouse') {
        response.setHeader('content-type', 'application/json')
        response.end(JSON.stringify({ 'name': 'lighthouse', 'dist-tags': { latest: '1.0.0' }, 'versions': { '1.0.0': { name: 'lighthouse', version: '1.0.0', dependencies: { '@sentry/node': '^10.0.0' }, dist: { tarball: `${origin}/fixture.tgz`, integrity: `sha512-${createHash('sha512').update(tarball).digest('base64')}` } } } }))
      }
      else if (request.url === '/fixture.tgz') {
        response.end(tarball)
      }
      else {
        response.statusCode = 404
        response.end()
      }
    })
    const resolve = await downloadRuntimePackages({ lighthouse: '1.0.0' }, { cacheDir: join(root, 'cache'), env: { npm_config_registry: origin, npm_config_cache: join(root, 'npm-cache') } })
    const runtime = await import(resolve('lighthouse'))
    expect(runtime.audit('https://example.com')).toEqual({ url: 'https://example.com', score: 1 })
    await expect(runtime.telemetry()).rejects.toMatchObject({ code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' })
  }
  finally {
    registry.closeAllConnections()
    registry.close()
    await rm(root, { recursive: true, force: true })
  }
})

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
