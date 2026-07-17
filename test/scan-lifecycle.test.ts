import type { CreateScanLifecycleOptions } from '@unlighthouse/core'
import type { HookMap } from '@unlighthouse/contracts/hooks'
import { describe, expect, it } from 'vitest'
import { parseScanId } from '@unlighthouse/contracts/types/atoms'
import { createScanLifecycle } from '@unlighthouse/core'
import { memoryStorage } from '@unlighthouse/core/storage/memory'

function fixture() {
  const storage = memoryStorage()
  const events: Array<{ event: keyof HookMap, payload: unknown }> = []
  const emit: CreateScanLifecycleOptions['emit'] = async (event, payload) => {
    events.push({ event, payload })
  }
  const startedAtMs = Date.now() - 100
  const scanId = parseScanId('scan_lifecycle00000000000000000')
  const lifecycle = createScanLifecycle({
    storage,
    config: { site: 'https://example.com/docs' },
    emit,
    scan: {
      scanId,
      site: 'https://example.com/docs',
      devices: ['mobile'],
      mode: 'site',
      startedAt: new Date(startedAtMs).toISOString(),
      startedAtMs,
      ciBuild: { branch: 'main', hash: 'abc123', message: 'test' },
    },
  })
  return { storage, events, scanId, lifecycle }
}

describe('scan lifecycle', () => {
  it('owns site association, status/progress persistence, and hook emission', async () => {
    const { storage, events, scanId, lifecycle } = fixture()

    await lifecycle.create()
    await lifecycle.create()
    await lifecycle.discovering()
    await lifecycle.scanning(2)
    await lifecycle.progress({ discovered: 2, scanned: 1, failed: 0, total: 2 })
    await lifecycle.pause()
    await lifecycle.pause()
    await lifecycle.resume()

    expect(await storage.sites.get(encodeURIComponent('https://example.com'))).toMatchObject({
      name: 'example.com',
      url: 'https://example.com',
    })
    expect(await storage.scans.get(scanId)).toMatchObject({
      siteId: encodeURIComponent('https://example.com'),
      mode: 'site',
      device: 'mobile',
      status: 'scanning',
      ciBranch: 'main',
      ciCommit: 'abc123',
      summary: {
        routes: 2,
        completed: 1,
        failed: 0,
        devices: ['mobile'],
      },
    })
    expect(events.map(event => event.event)).toEqual([
      'scan:created',
      'scan:started',
      'scan:discovering',
      'scan:scanning',
      'scan:progress',
      'scan:paused',
      'scan:resumed',
    ])
  })

  it('finalizes idempotently through the shared core aggregation path', async () => {
    const { storage, events, scanId, lifecycle } = fixture()
    await lifecycle.create()
    await lifecycle.scanning(0)

    const first = await lifecycle.complete({ discovered: 0, scanned: 0, failed: 0 })
    const second = await lifecycle.complete({ discovered: 0, scanned: 0, failed: 0 })

    expect(second).toEqual(first)
    expect(await storage.scans.get(scanId)).toMatchObject({ status: 'complete', summary: first })
    expect(events.filter(event => event.event === 'scan:complete')).toHaveLength(1)
  })

  it('keeps terminal cancellation and error transitions idempotent', async () => {
    const cancelled = fixture()
    await cancelled.lifecycle.create()
    await cancelled.lifecycle.scanning(1)
    await cancelled.lifecycle.cancel('user requested')
    await cancelled.lifecycle.cancel('duplicate')
    await cancelled.lifecycle.fail(new Error('late error'))

    expect(await cancelled.storage.scans.get(cancelled.scanId)).toMatchObject({ status: 'cancelled' })
    expect(cancelled.events.filter(event => event.event === 'scan:cancelled')).toHaveLength(1)
    expect(cancelled.events.some(event => event.event === 'scan:error')).toBe(false)

    const failed = fixture()
    await failed.lifecycle.create()
    await failed.lifecycle.fail(new Error('scheduler failed'))
    await failed.lifecycle.fail(new Error('duplicate'))

    expect(await failed.storage.scans.get(failed.scanId)).toMatchObject({ status: 'error' })
    expect(failed.events.filter(event => event.event === 'scan:error')).toHaveLength(1)
  })
})
