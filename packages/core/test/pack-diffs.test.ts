import type { ScanId } from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx } from '../src/api/handlers/types'
import { describe, expect, it } from 'vitest'
import { computePackDiffs } from '../src/api/handlers/compare/pack-diffs'

const BASE_SCAN_ID = 'base-scan' as ScanId
const CURRENT_SCAN_ID = 'current-scan' as ScanId

function makeRun(scanId: ScanId, packName: string, report: unknown, reportBlobKey: string | null = null) {
  return {
    scanId,
    packName,
    packVersion: '1.0.0',
    startedAt: '2026-07-19T00:00:00.000Z',
    completedAt: '2026-07-19T00:00:01.000Z',
    report,
    reportBlobKey,
  }
}

function makeCtx(base: unknown, current: unknown, options: {
  basePackName?: string
  currentPackName?: string
  blobs?: Record<string, string>
} = {}): HandlerCtx {
  return {
    storage: {
      packRuns: {
        listForScan: async (scanId: ScanId) => [makeRun(
          scanId,
          scanId === BASE_SCAN_ID ? options.basePackName ?? 'js-bundle' : options.currentPackName ?? 'js-bundle',
          scanId === BASE_SCAN_ID ? base : current,
          scanId === BASE_SCAN_ID && base == null ? 'base-report.json' : scanId === CURRENT_SCAN_ID && current == null ? 'current-report.json' : null,
        )],
      },
      scans: {
        get: async (scanId: ScanId) => ({ scanId, device: 'desktop' }),
      },
      blobs: {
        get: async (key: string) => options.blobs?.[key] ? new TextEncoder().encode(options.blobs[key]) : null,
      },
    },
  } as unknown as HandlerCtx
}

describe('computePackDiffs', () => {
  it('ignores scan identity and object insertion order', async () => {
    const shared = {
      routesAnalysed: 1,
      severityCounts: { critical: 0, serious: 0, moderate: 0, minor: 0 },
      findings: [],
    }
    const base = { scanId: BASE_SCAN_ID, ...shared, metadata: { second: 2, first: 1 } }
    const current = { metadata: { first: 1, second: 2 }, ...shared, scanId: CURRENT_SCAN_ID }

    const [diff] = await computePackDiffs(makeCtx(base, current), BASE_SCAN_ID, CURRENT_SCAN_ID)

    expect(diff?.hasChanges).toBe(false)
  })

  it('still detects changes in measured pack data', async () => {
    const base = { scanId: BASE_SCAN_ID, routesAnalysed: 1, findings: [] }
    const current = { scanId: CURRENT_SCAN_ID, routesAnalysed: 1, findings: [{ severity: 'minor' }] }

    const [diff] = await computePackDiffs(makeCtx(base, current), BASE_SCAN_ID, CURRENT_SCAN_ID)

    expect(diff?.hasChanges).toBe(true)
  })

  it('rehydrates spilled pack reports before comparing them', async () => {
    const shared = { scanId: BASE_SCAN_ID, routesAnalysed: 2, findings: [] }
    const current = { ...shared, scanId: CURRENT_SCAN_ID, findings: [{ severity: 'minor' }] }
    const ctx = makeCtx(null, null, {
      blobs: {
        'base-report.json': JSON.stringify(shared),
        'current-report.json': JSON.stringify(current),
      },
    })

    const [diff] = await computePackDiffs(ctx, BASE_SCAN_ID, CURRENT_SCAN_ID)

    expect(diff?.base).toEqual(shared)
    expect(diff?.current).toEqual(current)
    expect(diff?.hasChanges).toBe(true)
  })

  it('keeps device-scoped cache keys internal to pack.run', async () => {
    const report = { scanId: BASE_SCAN_ID, routesAnalysed: 1, findings: [] }
    const current = { ...report, scanId: CURRENT_SCAN_ID }

    const [diff] = await computePackDiffs(makeCtx(report, current, {
      basePackName: 'cwv@desktop',
      currentPackName: 'cwv@desktop',
    }), BASE_SCAN_ID, CURRENT_SCAN_ID)

    expect(diff?.packName).toBe('cwv')
    expect(diff?.hasChanges).toBe(false)
  })

  it('does not report unreadable spilled reports as unchanged', async () => {
    const [diff] = await computePackDiffs(makeCtx(null, null), BASE_SCAN_ID, CURRENT_SCAN_ID)

    expect(diff?.hasChanges).toBe(true)
  })
})
