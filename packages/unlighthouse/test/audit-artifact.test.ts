import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'
import { strToU8, zipSync } from 'fflate'
import { expect, it } from 'vitest'
import { fetchAuditArtifact, readAuditArtifact } from '../src/audit-artifact'
import { downloadAuditRuntime } from '../src/compact-runtime'
import { downloadRuntimePackages, npmCommand } from '../src/runtime-download'

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-artifact-'))
  const zip = zipSync({
    'node_modules/fixture/package.json': strToU8(JSON.stringify({ name: 'fixture', type: 'module', main: 'index.mjs' })),
    'node_modules/fixture/index.mjs': strToU8('export const audit = url => ({ url, score: 1 })'),
  })
  const sha256 = createHash('sha256').update(zip).digest('hex')
  await mkdir(join(root, 'dist'))
  await writeFile(join(root, 'dist/runtime.zip'), zip)
  await writeFile(join(root, 'package.json'), JSON.stringify({ name: '@unlighthouse/lighthouse-runtime', version: '1.0.0', files: ['dist'] }))
  await new Promise<void>((resolve, reject) => {
    const { command, prefix } = npmCommand(process.env)
    const child = spawn(command, [...prefix, 'pack', '--offline', '--ignore-scripts', '--pack-destination', root], { cwd: root, stdio: 'ignore' })
    child.once('error', reject)
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`Fixture pack failed: ${code}`)))
  })
  const tarball = await readFile(join(root, 'unlighthouse-lighthouse-runtime-1.0.0.tgz'))
  return { root, zip, tarball, artifact: { version: '1.0.0', sha256 } }
}

it('downloads once without npm and reuses the cache offline', async () => {
  const input = await fixture()
  let requests = 0
  const server = createServer((_request, response) => { requests++; response.end(input.tarball) })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('Missing fixture address')
  const options = { cacheDir: join(input.root, 'cache'), artifact: input.artifact, url: `http://127.0.0.1:${address.port}/runtime.tgz`, env: { PATH: '' } }
  try {
    const [first, second] = await Promise.all([downloadAuditRuntime(options), downloadAuditRuntime(options)])
    server.closeAllConnections()
    server.close()
    const offline = await downloadAuditRuntime({ ...options, url: 'http://127.0.0.1:9/offline.tgz' })
    for (const resolve of [first, second, offline])
      expect((await import(resolve('fixture'))).audit('https://example.com')).toEqual({ url: 'https://example.com', score: 1 })
    expect(requests).toBe(1)
  }
  finally { server.closeAllConnections(); server.close(); await rm(input.root, { recursive: true, force: true }) }
})

it('rejects a modified archive and permits a clean retry', async () => {
  const input = await fixture()
  const options = { cacheDir: join(input.root, 'cache'), artifact: input.artifact, url: 'https://example.com/runtime.tgz' }
  try {
    const wrong = { ...input.artifact, sha256: '0'.repeat(64) }
    await expect(downloadAuditRuntime({ ...options, artifact: wrong, fetch: async () => new Response(input.tarball) })).rejects.toThrow('Audit runtime integrity mismatch')
    const resolve = await downloadAuditRuntime({ ...options, fetch: async () => new Response(input.tarball) })
    expect((await import(resolve('fixture'))).audit('retry').score).toBe(1)
  }
  finally { await rm(input.root, { recursive: true, force: true }) }
})

it('rejects cancelled and oversized downloads before cache publication', async () => {
  const input = await fixture()
  const controller = new AbortController()
  const options = { cacheDir: join(input.root, 'cache'), artifact: input.artifact, url: 'https://example.com/runtime.tgz' }
  try {
    await expect(downloadAuditRuntime({ ...options, maxDownloadBytes: 4, fetch: async () => new Response(input.tarball) })).rejects.toThrow('Audit download exceeds')
    await expect(downloadAuditRuntime({ ...options, signal: controller.signal, fetch: async () => {
      controller.abort(new Error('Scan cancelled'))
      return new Response(input.tarball)
    } })).rejects.toThrow('Scan cancelled')
    const resolve = await downloadAuditRuntime({ ...options, fetch: async () => new Response(input.tarball) })
    expect((await import(resolve('fixture'))).audit('retry').url).toBe('retry')
  }
  finally { await rm(input.root, { recursive: true, force: true }) }
})

it('keeps npm installation available for configured registries', async () => {
  const input = await fixture()
  let installed = 0
  try {
    const resolve = await downloadAuditRuntime({
      cacheDir: join(input.root, 'cache'),
      artifact: input.artifact,
      env: { npm_config_registry: 'https://mirror.example.com' },
      fetch: async () => { throw new Error('Native download must not run') },
      install: async (directory) => {
        installed++
        const target = join(directory, 'node_modules/@unlighthouse/lighthouse-runtime')
        await mkdir(join(target, 'dist'), { recursive: true })
        await writeFile(join(target, 'package.json'), JSON.stringify({ name: '@unlighthouse/lighthouse-runtime', main: 'dist/runtime.zip' }))
        await writeFile(join(target, 'dist/runtime.zip'), input.zip)
      },
    })
    expect((await import(resolve('fixture'))).audit('mirror').score).toBe(1)
    expect(installed).toBe(1)
  }
  finally { await rm(input.root, { recursive: true, force: true }) }
})

it('rejects corrupt tar headers, truncated payloads, and missing runtime entries', async () => {
  const input = await fixture()
  try {
    expect(createHash('sha256').update(readAuditArtifact(input.tarball, input.artifact.sha256)).digest('hex')).toBe(input.artifact.sha256)
    const corrupt = gunzipSync(input.tarball)
    corrupt[0] = corrupt[0]! ^ 1
    expect(() => readAuditArtifact(gzipSync(corrupt), input.artifact.sha256)).toThrow('Invalid audit tarball')
    expect(() => readAuditArtifact(gzipSync(gunzipSync(input.tarball).subarray(0, 600)), input.artifact.sha256)).toThrow('Invalid audit tarball')
    expect(() => readAuditArtifact(gzipSync(Buffer.alloc(1024)), input.artifact.sha256)).toThrow('Audit runtime payload is missing')
  }
  finally { await rm(input.root, { recursive: true, force: true }) }
})

it('rejects oversized gzip output before archive extraction', () => {
  expect(() => readAuditArtifact(gzipSync(Buffer.alloc(25_000_001)), '0'.repeat(64))).toThrow()
})

it('rejects unsupported protocols and failed HTTP responses', async () => {
  await expect(fetchAuditArtifact('file:///runtime.tgz', '0'.repeat(64))).rejects.toThrow('HTTP or HTTPS')
  await expect(fetchAuditArtifact('https://example.com/runtime.tgz', '0'.repeat(64), {
    fetch: async () => new Response('Unavailable', { status: 503 }),
  })).rejects.toThrow('Audit runtime download failed (503)')
})

it('rejects URL credentials without exposing them or making a request', async () => {
  let requests = 0
  const error = await fetchAuditArtifact('https://user:secret@mirror.example.com/runtime.tgz', '0'.repeat(64), {
    fetch: async () => { requests++; return new Response('unused') },
  }).catch(error => error)
  expect(error).toBeInstanceOf(Error)
  expect(error.message).toContain('must not include credentials')
  expect(error.message).not.toContain('secret')
  expect(requests).toBe(0)
})

it('does not retain an npm install with the wrong runtime hash', async () => {
  const input = await fixture()
  let installs = 0
  const options = {
    cacheDir: join(input.root, 'cache'),
    artifact: input.artifact,
    install: async (directory: string) => {
      installs++
      const target = join(directory, 'node_modules/@unlighthouse/lighthouse-runtime')
      await mkdir(join(target, 'dist'), { recursive: true })
      await writeFile(join(target, 'package.json'), JSON.stringify({ name: '@unlighthouse/lighthouse-runtime', main: 'dist/runtime.zip' }))
      await writeFile(join(target, 'dist/runtime.zip'), installs === 1 ? Buffer.from('wrong archive') : input.zip)
    },
  }
  try {
    await expect(downloadAuditRuntime(options)).rejects.toThrow('integrity')
    const resolve = await downloadAuditRuntime(options)
    expect((await import(resolve('fixture'))).audit('retry').score).toBe(1)
    expect(installs).toBe(2)
  }
  finally { await rm(input.root, { recursive: true, force: true }) }
})

it('replaces a previously published bad npm cache before retrying the audit', async () => {
  const input = await fixture()
  const cacheDir = join(input.root, 'cache')
  const install = async (directory: string, archive: Uint8Array) => {
    const target = join(directory, 'node_modules/@unlighthouse/lighthouse-runtime')
    await mkdir(join(target, 'dist'), { recursive: true })
    await writeFile(join(target, 'package.json'), JSON.stringify({ name: '@unlighthouse/lighthouse-runtime', main: 'dist/runtime.zip' }))
    await writeFile(join(target, 'dist/runtime.zip'), archive)
  }
  try {
    await downloadRuntimePackages({ '@unlighthouse/lighthouse-runtime': input.artifact.version }, {
      cacheDir,
      install: directory => install(directory, Buffer.from('damaged cache')),
    })
    const resolve = await downloadAuditRuntime({ cacheDir, artifact: input.artifact, install: directory => install(directory, input.zip) })
    expect((await import(resolve('fixture'))).audit('recovered').url).toBe('recovered')
  }
  finally { await rm(input.root, { recursive: true, force: true }) }
})
