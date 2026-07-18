// D-044 ship gate: prune dry-run over memory storage. Seeds several scans +
// their namespaced blobs, asserts dry-run reports the right deletions without
// mutating, a real prune deletes rows + blobs, and keepCiBaselines protects a
// scan referenced as a comparison baseline.

import type { ScanInsert, Storage } from '@unlighthouse/contracts/ports'
import type { ScanId } from '@unlighthouse/contracts/types/atoms'
import { pruneScans } from '@unlighthouse/core/runtime'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { beforeEach, describe, expect, it } from 'vitest'

const SITE = 'https://example.com'

function isoAt(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

function scanInsert(id: string, startedAt: string): ScanInsert {
  return {
    scanId: id as ScanId,
    site: SITE,
    device: 'mobile',
    status: 'complete',
    startedAt,
    completedAt: startedAt,
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
  }
}

// scan ids ordered oldest → newest.
const IDS = ['scan_0', 'scan_1', 'scan_2', 'scan_3', 'scan_4']

async function seed(storage: Storage): Promise<void> {
  for (let i = 0; i < IDS.length; i++) {
    const id = IDS[i]
    // startedAt increases with i, so scan_0 is oldest, scan_4 newest.
    await storage.scans.create(scanInsert(id, isoAt(-((IDS.length - i) * 60_000))))
    // Two namespaced blobs per scan.
    await storage.blobs.put(`scans/${id}/lhr/a.json.gz`, new Uint8Array([1, 2, 3]))
    await storage.blobs.put(`scans/${id}/reports/a.json`, new Uint8Array([4, 5, 6]))
  }
}

describe('pruneScans (D-044)', () => {
  let storage: Storage
  beforeEach(async () => {
    storage = memoryStorage()
    await seed(storage)
  })

  it('unlimited retention deletes nothing', async () => {
    const res = await pruneScans(storage, undefined)
    expect(res.totalScansDeleted).toBe(0)
    expect(res.deletions).toEqual([])
    const list = await storage.scans.list({ site: SITE })
    expect(list.total).toBe(5)
  })

  it('dry-run reports oldest-first deletions without mutating storage', async () => {
    const res = await pruneScans(storage, { maxScansPerSite: 2 }, { dryRun: true })

    expect(res.dryRun).toBe(true)
    // 5 scans, keep 2 newest → 3 oldest are candidates.
    expect(res.totalScansDeleted).toBe(3)
    // Oldest-first ordering.
    expect(res.deletions.map(d => d.scanId)).toEqual(['scan_0', 'scan_1', 'scan_2'])
    // Each reports its namespaced blob keys (2 per scan) → 6 total.
    expect(res.totalBlobsDeleted).toBe(6)
    for (const d of res.deletions)
      expect(d.blobKeys.length).toBe(2)
    expect(res.deletions[0].reasons).toContain('count')

    // Nothing was actually mutated.
    const list = await storage.scans.list({ site: SITE })
    expect(list.total).toBe(5)
    expect(await storage.blobs.has(`scans/scan_0/lhr/a.json.gz`)).toBe(true)
  })

  it('real prune deletes rows + namespaced blobs oldest-first', async () => {
    const res = await pruneScans(storage, { maxScansPerSite: 2 })

    expect(res.dryRun).toBe(false)
    expect(res.totalScansDeleted).toBe(3)

    // The 3 oldest scans + their blobs are gone; the 2 newest remain.
    expect(await storage.scans.get('scan_0' as ScanId)).toBeNull()
    expect(await storage.scans.get('scan_2' as ScanId)).toBeNull()
    expect(await storage.scans.get('scan_3' as ScanId)).not.toBeNull()
    expect(await storage.scans.get('scan_4' as ScanId)).not.toBeNull()

    expect(await storage.blobs.has(`scans/scan_0/lhr/a.json.gz`)).toBe(false)
    expect(await storage.blobs.has(`scans/scan_0/reports/a.json`)).toBe(false)
    expect(await storage.blobs.has(`scans/scan_4/lhr/a.json.gz`)).toBe(true)

    const list = await storage.scans.list({ site: SITE })
    expect(list.total).toBe(2)
  })

  it('maxAgeDays prunes only scans older than the cutoff', async () => {
    // Age all scans 10 days back except the newest (which is ~1 min old).
    // Use `now` far in the future so the four oldest are past a 5-day cutoff.
    const now = Date.now() + 10 * 24 * 60 * 60 * 1000
    const res = await pruneScans(storage, { maxAgeDays: 5 }, { dryRun: true, now })
    // All 5 scans started ~minutes ago relative to real now, so 10 days later
    // every one is older than 5 days → all 5 are candidates.
    expect(res.totalScansDeleted).toBe(5)
    for (const d of res.deletions)
      expect(d.reasons).toContain('age')
  })

  it('keepCiBaselines protects a scan referenced as a comparison baseline', async () => {
    // Wrap memory storage so the oldest scan looks like a comparison baseline.
    const base = storage
    const guarded: Storage = {
      ...base,
      comparisons: {
        ...base.comparisons,
        async list(q) {
          return q?.baseScanId === 'scan_0' ? [{ id: 1 }] : []
        },
      },
    }

    const res = await pruneScans(guarded, { maxScansPerSite: 2, keepCiBaselines: true })

    // scan_0 (oldest, a candidate by count) is protected; scan_1 + scan_2 deleted.
    expect(res.totalScansDeleted).toBe(2)
    expect(res.deletions.map(d => d.scanId)).toEqual(['scan_1', 'scan_2'])
    const siteRes = res.perSite.find(p => p.site === SITE)
    expect(siteRes?.protectedBaselines).toBe(1)

    // The baseline survives.
    expect(await guarded.scans.get('scan_0' as ScanId)).not.toBeNull()
    expect(await guarded.blobs.has(`scans/scan_0/lhr/a.json.gz`)).toBe(true)
  })
})
