// R2 TTL sweeper Worker. The bucket stores `expiresAt` in customMetadata
// (set by r2BlobStore.put when the caller passes `opts.ttl`); the sweeper
// is a cron-triggered Worker that lists + deletes anything past expiry.
//
// Test the sweep logic against a minimal in-memory R2 stub — no Workers
// runtime, no miniflare. The shape is the same as the production
// R2Bucket interface for the few methods sweepExpiredBlobs touches.

import { sweepExpiredBlobs } from '@unlighthouse/cloudflare'
import { describe, expect, it } from 'vitest'

interface FakeObject {
  key: string
  customMetadata?: Record<string, string>
}

function makeBucket(initial: FakeObject[] = []) {
  const store = new Map<string, FakeObject>()
  for (const o of initial)
    store.set(o.key, o)

  return {
    async list(opts: { cursor?: string, limit?: number, include?: string[] }) {
      const all = Array.from(store.values())
      const limit = opts.limit ?? 1000
      const start = opts.cursor ? Number(opts.cursor) : 0
      const slice = all.slice(start, start + limit)
      const nextCursor = start + limit < all.length ? String(start + limit) : undefined
      return {
        objects: slice,
        truncated: nextCursor != null,
        cursor: nextCursor,
      }
    },
    async delete(keys: string | string[]) {
      const list = Array.isArray(keys) ? keys : [keys]
      for (const k of list)
        store.delete(k)
    },
    _all() {
      return Array.from(store.keys()).sort()
    },
  }
}

describe('R2 TTL sweeper', () => {
  it('deletes objects whose expiresAt has passed', async () => {
    const bucket = makeBucket([
      { key: 'fresh', customMetadata: { expiresAt: String(2_000_000) } },
      { key: 'expired-1', customMetadata: { expiresAt: String(500_000) } },
      { key: 'expired-2', customMetadata: { expiresAt: String(900_000) } },
      { key: 'no-ttl' }, // no expiresAt → never expires
    ])
    const result = await sweepExpiredBlobs({ BLOBS: bucket as never }, 1_000_000)

    expect(result.scanned).toBe(4)
    expect(result.deleted).toBe(2)
    expect(bucket._all()).toEqual(['fresh', 'no-ttl'])
  })

  it('respects the page size and walks multiple pages', async () => {
    // 250 objects, all expired. Page size 100 → 3 list calls.
    const objs = Array.from({ length: 250 }, (_, i) => ({
      key: `obj-${i}`,
      customMetadata: { expiresAt: '1' },
    }))
    const bucket = makeBucket(objs)
    const result = await sweepExpiredBlobs(
      { BLOBS: bucket as never, SWEEPER_PAGE_SIZE: '100' },
      Date.now(),
    )
    expect(result.scanned).toBe(250)
    expect(result.deleted).toBe(250)
    expect(bucket._all()).toEqual([])
  })

  it('is a no-op on a bucket with no expiring objects', async () => {
    const bucket = makeBucket([
      { key: 'a' },
      { key: 'b', customMetadata: {} },
      { key: 'c', customMetadata: { contentType: 'application/json' } },
    ])
    const result = await sweepExpiredBlobs({ BLOBS: bucket as never })
    expect(result.scanned).toBe(3)
    expect(result.deleted).toBe(0)
    expect(bucket._all()).toEqual(['a', 'b', 'c'])
  })

  it('ignores malformed expiresAt values rather than blow up', async () => {
    const bucket = makeBucket([
      { key: 'bad-format', customMetadata: { expiresAt: 'not-a-number' } },
      { key: 'zero', customMetadata: { expiresAt: '0' } },
      { key: 'negative', customMetadata: { expiresAt: '-1' } },
      { key: 'real-expired', customMetadata: { expiresAt: '500' } },
    ])
    const result = await sweepExpiredBlobs({ BLOBS: bucket as never }, 1000)
    // Only the legitimately-expired one gets swept.
    expect(result.deleted).toBe(1)
    expect(bucket._all()).toEqual(['bad-format', 'negative', 'zero'])
  })
})
