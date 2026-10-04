import { chmod, mkdir, mkdtemp, readFile, rm, stat, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import { expect, it } from 'vitest'
import { extractAuditRuntime } from '../src/compact-runtime'

function fixture() {
  return zipSync({
    'node_modules/fixture/package.json': strToU8(JSON.stringify({ name: 'fixture', type: 'module', main: 'index.mjs' })),
    'node_modules/fixture/index.mjs': strToU8('export const audit = url => ({ url, score: 1 })'),
  })
}

it.skipIf(process.platform === 'win32').each([0o700, 0o777])('checks symlink cache parents with permissions %s', async (mode) => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-cache-link-'))
  const target = join(root, 'private')
  const parent = join(root, 'aliases')
  const alias = join(parent, 'cache')
  try {
    await mkdir(target, { mode: 0o700 })
    await mkdir(parent, { mode: 0o700 })
    await chmod(parent, mode)
    await symlink(target, alias, 'dir')
    const extraction = extractAuditRuntime(join(alias, 'engine'), async () => fixture())
    if (mode === 0o777)
      await expect(extraction).rejects.toThrow('Runtime cache is not protected')
    else
      expect((await import((await extraction)('fixture'))).audit('private-alias').url).toBe('private-alias')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it('shares extraction and reuses an offline runtime', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-archive-'))
  let reads = 0
  const archive = async () => { reads++; return fixture() }
  try {
    const [first, second] = await Promise.all([
      extractAuditRuntime(join(root, 'engines'), archive),
      extractAuditRuntime(join(root, 'engines'), archive),
    ])
    const third = await extractAuditRuntime(join(root, 'engines'), async () => { throw new Error('Offline') })
    for (const resolve of [first, second, third])
      expect((await import(resolve('fixture'))).audit('https://example.com')).toEqual({ url: 'https://example.com', score: 1 })
    expect(reads).toBe(1)
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it.each(['../outside', '/absolute', 'node_modules/../outside', 'node_modules\\outside', 'node_modules/C:/outside', 'node_modules/.. /outside', 'node_modules/fixture/NUL.js', 'node_modules/fixture/index.mjs.'])('rejects unsafe archive entry %s', async (name) => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-archive-'))
  try {
    const archive = zipSync({ [name]: strToU8('unsafe') })
    await expect(extractAuditRuntime(join(root, 'engines'), async () => archive)).rejects.toThrow('Invalid audit archive path')
    await expect(readFile(join(root, 'outside'))).rejects.toMatchObject({ code: 'ENOENT' })
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it.skipIf(process.platform === 'win32')('uses private permissions and rejects a cache writable by other users', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-private-'))
  try {
    const destination = join(root, 'private/engines')
    await extractAuditRuntime(destination, async () => fixture())
    expect((await stat(destination)).mode & 0o077).toBe(0)
    const unsafe = join(root, 'unsafe')
    await mkdir(unsafe)
    await chmod(unsafe, 0o777)
    await expect(extractAuditRuntime(join(unsafe, 'engines'), async () => fixture())).rejects.toThrow('private directory')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it('rejects oversized archives before extraction', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-archive-'))
  try {
    await expect(extractAuditRuntime(join(root, 'engines'), async () => fixture(), { maxBytes: 4 })).rejects.toThrow('Audit archive exceeds')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})

it('retries after corruption or cancellation without publishing partial output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-archive-'))
  const destination = join(root, 'engines')
  const controller = new AbortController()
  try {
    await expect(extractAuditRuntime(destination, async () => strToU8('broken'))).rejects.toThrow()
    await expect(extractAuditRuntime(destination, async () => {
      controller.abort(new Error('Scan cancelled'))
      return fixture()
    }, { signal: controller.signal })).rejects.toThrow('Scan cancelled')
    const resolve = await extractAuditRuntime(destination, async () => fixture())
    expect((await import(resolve('fixture'))).audit('retry').url).toBe('retry')
  }
  finally { await rm(root, { recursive: true, force: true }) }
})
