import { mkdtemp, readFile, rm } from 'node:fs/promises'
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

it.each(['../outside', '/absolute', 'node_modules/../outside', 'node_modules\\outside', 'node_modules/C:/outside'])('rejects unsafe archive entry %s', async (name) => {
  const root = await mkdtemp(join(tmpdir(), 'unlighthouse-archive-'))
  try {
    const archive = zipSync({ [name]: strToU8('unsafe') })
    await expect(extractAuditRuntime(join(root, 'engines'), async () => archive)).rejects.toThrow('Invalid audit archive path')
    await expect(readFile(join(root, 'outside'))).rejects.toMatchObject({ code: 'ENOENT' })
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
