// Proves the third-party pack seam (P0-1): host-supplied packs are visible to
// `pack.list` and executable by `pack.run`, a user pack overrides a built-in by
// name, and an empty registry still exposes the built-ins.

import type { Pack } from '@unlighthouse/contracts/packs'
import type { Scan, ScanId } from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import type { UnlighthouseCore } from '@unlighthouse/contracts'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { builtInPacks, createPackRegistry } from '@unlighthouse/core/packs'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { testConfig, testScanId, testUrl } from './helpers/contracts'

const SCAN_ID = testScanId('pack-registry-0001')

// A minimal third-party pack whose report shape is its own.
const fakePack: Pack<{ ok: boolean, marker: string }> = {
  name: 'test-pack',
  description: 'A fixture third-party pack.',
  version: '1.0.0',
  reportSchema: z.object({ ok: z.boolean(), marker: z.string() }),
  reconciler: async ctx => ({ ok: true, marker: ctx.scanId }),
}

function makeScan(id: ScanId = SCAN_ID): Scan {
  return {
    scanId: id,
    siteId: 'https://example.com',
    site: testUrl('https://example.com'),
    mode: 'site',
    device: 'mobile',
    status: 'complete',
    startedAt: '2025-01-01T00:00:00.000Z',
    completedAt: '2025-01-01T00:05:00.000Z',
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
    summary: null,
  }
}

function stubCore(): UnlighthouseCore {
  return {
    run: () => { throw new Error('core.run not exercised in this test') },
    session: () => null,
    hooks: undefined,
  }
}

function makeCtx(packs?: Pack[]): HandlerCtx {
  return {
    core: stubCore(),
    auditor: createMockAuditor(),
    storage: memoryStorage(),
    config: testConfig({
      site: 'https://example.com',
      scanner: { device: 'mobile', samples: 1 },
      auditor: { name: 'mock' },
    }),
    version: '0.0.0-test',
    packs: createPackRegistry(packs),
  }
}

describe('pack registry seam', () => {
  it('createPackRegistry() with no packs exposes exactly the built-ins', () => {
    const registry = createPackRegistry()
    expect(registry.list()).toHaveLength(Object.keys(builtInPacks).length)
    expect(registry.get('overview')).toBeDefined()
    expect(registry.get('test-pack')).toBeUndefined()
  })

  it('merges a user pack over the built-ins by name', () => {
    const override: Pack = { ...fakePack, name: 'overview', version: '9.9.9' }
    const registry = createPackRegistry([override])
    expect(registry.get('overview')?.version).toBe('9.9.9')
    // Count is unchanged — an override replaces, it doesn't add.
    expect(registry.list()).toHaveLength(Object.keys(builtInPacks).length)
  })

  it('pack.list surfaces a host-registered third-party pack', async () => {
    const ctx = makeCtx([fakePack])
    const result = await createHandlers()['pack.list'].run({}, ctx)
    expect(result.packs.map(p => p.name)).toContain('test-pack')
  })

  it('pack.run executes a host-registered third-party pack', async () => {
    const ctx = makeCtx([fakePack])
    await ctx.storage.scans.create(makeScan())
    const result = await createHandlers()['pack.run'].run(
      { scanId: SCAN_ID, pack: 'test-pack' },
      ctx,
    )
    expect(result.packName).toBe('test-pack')
    expect(result.report).toEqual({ ok: true, marker: SCAN_ID })
  })

  it('pack.run rejects an unregistered pack name', async () => {
    const ctx = makeCtx()
    await ctx.storage.scans.create(makeScan())
    await expect(
      createHandlers()['pack.run'].run({ scanId: SCAN_ID, pack: 'nope' }, ctx),
    ).rejects.toMatchObject({ code: 'PACK_NOT_FOUND' })
  })
})
