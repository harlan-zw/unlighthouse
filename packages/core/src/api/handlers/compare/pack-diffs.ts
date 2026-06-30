import type { PackDiff } from '@unlighthouse/contracts/commands'
import type { ScanId } from '@unlighthouse/contracts/types/atoms'
import type { HandlerCtx } from '../types'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'

type PackSummary = NonNullable<PackDiff['baseSummary']>

function emptyPackSummary(): PackSummary {
  return {
    findings: null,
    routesAnalysed: null,
    totalBytesSavable: null,
    critical: null,
    serious: null,
    moderate: null,
    minor: null,
  }
}

function summarisePackReport(report: unknown): PackSummary {
  if (!report || typeof report !== 'object')
    return emptyPackSummary()

  const record = report as Record<string, unknown>
  const severityCounts = (record.severityCounts as Record<string, number> | undefined) ?? {}
  return {
    findings: Array.isArray(record.findings) ? record.findings.length : null,
    routesAnalysed: typeof record.routesAnalysed === 'number' ? record.routesAnalysed : null,
    totalBytesSavable: typeof record.totalBytesSavable === 'number' ? record.totalBytesSavable : null,
    critical: typeof severityCounts.critical === 'number' ? severityCounts.critical : null,
    serious: typeof severityCounts.serious === 'number' ? severityCounts.serious : null,
    moderate: typeof severityCounts.moderate === 'number' ? severityCounts.moderate : null,
    minor: typeof severityCounts.minor === 'number' ? severityCounts.minor : null,
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b)
  }
  catch (_err) {
    // Non-serializable pack values are considered different.
    return false
  }
}

export async function computePackDiffs(ctx: HandlerCtx, baseScanId: ScanId, currentScanId: ScanId): Promise<PackDiff[]> {
  const [baseRuns, currentRuns] = await Promise.all([
    ctx.storage.packRuns.listForScan(baseScanId).catch((err) => {
      logOperationalWarn('compare.pack_cache_read_failed', err, { scanId: baseScanId, side: 'base' })
      return [] as Array<{ packName: string, report?: unknown }>
    }),
    ctx.storage.packRuns.listForScan(currentScanId).catch((err) => {
      logOperationalWarn('compare.pack_cache_read_failed', err, { scanId: currentScanId, side: 'current' })
      return [] as Array<{ packName: string, report?: unknown }>
    }),
  ])

  const baseByName = new Map(baseRuns.map(run => [run.packName, run.report]))
  const currentByName = new Map(currentRuns.map(run => [run.packName, run.report]))
  const allPacks = new Set([...baseByName.keys(), ...currentByName.keys()])

  return Array.from(allPacks).sort().map((packName) => {
    const base = baseByName.get(packName) ?? null
    const current = currentByName.get(packName) ?? null
    return {
      packName,
      base,
      current,
      baseSummary: base ? summarisePackReport(base) : null,
      currentSummary: current ? summarisePackReport(current) : null,
      hasChanges: !deepEqual(base, current),
    }
  })
}
