import { unstorageBlobs } from '@unlighthouse/core/storage/unstorage-blobs'
import { afterEach, describe, expect, it, vi } from 'vitest'

function memoryDriver() {
  const data = new Map<string, unknown>()
  return {
    name: 'test-memory',
    getInstance: () => data,
    hasItem: (key: string) => data.has(key),
    getItem: (key: string) => data.get(key) ?? null,
    getItemRaw: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: unknown) => { data.set(key, value) },
    setItemRaw: (key: string, value: unknown) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
    getKeys: () => [...data.keys()],
  }
}

describe('unstorage BlobStore adapter', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('preserves ttl/contentType metadata and hides metadata sidecars from list', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const driver = memoryDriver()
    const blobs = unstorageBlobs({ driver })

    await blobs.put('reports/a.json', new TextEncoder().encode('{}'), {
      ttl: 60,
      contentType: 'application/json',
    })

    const instance = driver.getInstance?.() as Map<string, unknown>
    const storedMeta = instance.get('reports:a.json$')
    expect(JSON.parse(String(storedMeta))).toMatchObject({
      ttl: 60,
      expiresAt: 61_000,
      contentType: 'application/json',
    })
    expect(await blobs.list('reports/')).toEqual(['reports/a.json'])
  })

  it('enforces ttl on get/has and removes expired data', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const blobs = unstorageBlobs({ driver: memoryDriver() })
    await blobs.put('short-lived', new Uint8Array([1, 2, 3]), { ttl: 1 })
    expect(await blobs.has('short-lived')).toBe(true)

    now.mockReturnValue(2_001)
    expect(await blobs.get('short-lived')).toBeNull()
    expect(await blobs.has('short-lived')).toBe(false)
  })

  it('clears prior ttl metadata when an object is overwritten without options', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const blobs = unstorageBlobs({ driver: memoryDriver() })
    await blobs.put('overwrite', new Uint8Array([1]), { ttl: 1 })
    await blobs.put('overwrite', new Uint8Array([2]))

    now.mockReturnValue(5_000)
    expect(Array.from((await blobs.get('overwrite')) ?? [])).toEqual([2])
  })
})
