// Proves the third-party pack seam (P0-1): host-supplied packs are visible to
// `pack.list` and executable by `pack.run`, a user pack overrides a built-in by
// name, and an empty registry still exposes the built-ins.
//
// Also covers D-045 (`pack.list` gains `ui` + `reportSchema`; `pack.run`'s
// report schema widens to accept a custom pack's own report shape) and D-046
// (config-sourced packs reach the registry via `createPackRegistry`, the same
// seam `resolveConfig`/`host.ts` feed at runtime).

import type { UnlighthouseCore } from '@unlighthouse/contracts'
import type { Pack } from '@unlighthouse/contracts/packs'
import type { Scan, ScanId } from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { PackRunCmd } from '@unlighthouse/contracts/commands'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { builtInPacks, createPackRegistry } from '@unlighthouse/core/packs'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { testConfig, testScanId, testUrl } from '../../../test/helpers/contracts'

const SCAN_ID = testScanId('pack-registry-0001')

// A minimal third-party pack whose report shape is its own.
const fakePack: Pack<{ ok: boolean, marker: string }> = {
  name: 'test-pack',
  description: 'A fixture third-party pack.',
  version: '1.0.0',
  reportSchema: z.object({ ok: z.boolean(), marker: z.string() }),
  reconciler: async ctx => ({ ok: true, marker: ctx.scanId }),
  ui: { tab: 'Test Pack' },
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

  it('pack.list returns ui + a convertible reportSchema for every built-in pack', async () => {
    const ctx = makeCtx()
    const result = await createHandlers()['pack.list'].run({}, ctx)
    expect(result.packs).toHaveLength(Object.keys(builtInPacks).length)
    for (const pack of result.packs) {
      expect(pack.ui.tab, `${pack.name} should carry a ui.tab`).toEqual(expect.any(String))
      expect(pack.ui.tab.length).toBeGreaterThan(0)
      expect(pack.reportSchema, `${pack.name}'s reportSchema should convert to JSON Schema`).not.toBeNull()
    }
    // best-practices (D-045) is a built-in now, not client-side-only.
    expect(result.packs.map(p => p.name)).toContain('best-practices')
  })

  it('pack.list degrades reportSchema to null for a pack z.toJSONSchema cannot convert', async () => {
    const unconvertiblePack: Pack = {
      name: 'unconvertible-pack',
      description: 'A fixture pack whose reportSchema cannot become JSON Schema.',
      version: '1.0.0',
      // z.custom() has no JSON Schema representation — z.toJSONSchema throws.
      reportSchema: z.custom<() => void>(() => true),
      reconciler: async () => undefined,
      ui: { tab: 'Unconvertible' },
    }
    const ctx = makeCtx([unconvertiblePack])
    const result = await createHandlers()['pack.list'].run({}, ctx)
    const entry = result.packs.find(p => p.name === 'unconvertible-pack')
    expect(entry).toBeDefined()
    expect(entry?.reportSchema).toBeNull()
  })

  it('pack.run output schema accepts a custom pack report shape the built-in union does not know', async () => {
    const ctx = makeCtx([fakePack])
    await ctx.storage.scans.create(makeScan())
    const result = await createHandlers()['pack.run'].run(
      { scanId: SCAN_ID, pack: 'test-pack' },
      ctx,
    )
    // Mirrors what packages/core/src/api/static-client.ts does for real
    // (`cmd.output.parse()`, which THROWS on mismatch) — this is the path
    // that would have hard-failed before the report field was widened.
    expect(() => PackRunCmd.output.parse(result)).not.toThrow()
  })

  it('config-sourced packs reach the registry the same way explicit host packs do', () => {
    // Stands in for `resolveConfig`'s `packs` return value (unlighthouse.config.ts
    // `packs: Pack[]`) being merged with `createUnlighthouseHost({ packs })` in
    // host.ts — both funnel through the same `createPackRegistry` seam this
    // registry test already exercises.
    const configSourced: Pack = { ...fakePack, name: 'config-pack' }
    const explicitOption: Pack = { ...fakePack, name: 'overview', version: '9.9.9' }
    // host.ts order: config-sourced first, explicit option second — the
    // registry's last-write-wins merge lets the explicit option win a collision.
    const registry = createPackRegistry([configSourced, explicitOption])
    expect(registry.get('config-pack')).toBeDefined()
    expect(registry.get('overview')?.version).toBe('9.9.9')
  })
})
