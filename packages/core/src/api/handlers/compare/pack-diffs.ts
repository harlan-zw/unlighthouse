import type { PackDiff } from '@unlighthouse/contracts/commands'
import type { PackRun } from '@unlighthouse/contracts/packs'
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

function canonicalReportValue(value: unknown, root = false): unknown {
  if (Array.isArray(value))
    return value.map(item => canonicalReportValue(item))
  if (!value || typeof value !== 'object')
    return value

  // Pack reports are JSON-shaped. Sort object keys so insertion order does
  // not create a false diff, and ignore the owning scan's top-level identity:
  // every built-in report embeds `scanId`, which necessarily differs between
  // the two scans even when the measured pack result is identical.
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !(root && key === 'scanId'))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => [key, canonicalReportValue(child)]),
  )
}

function deepEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(canonicalReportValue(a, true)) === JSON.stringify(canonicalReportValue(b, true))
  }
  catch (_err) {
    // Non-serializable pack values are considered different.
    return false
  }
}

function publicPackIdentity(packName: string): { packName: string, device?: 'mobile' | 'desktop' } {
  const match = packName.match(/^(.*)@(mobile|desktop)$/)
  return match?.[1]
    ? { packName: match[1], device: match[2] as 'mobile' | 'desktop' }
    : { packName }
}

// pack.run's device suffix is an internal cache-key detail. Collapse cache
// rows back to their public pack id, preferring the unsuffixed/full report and
// then the row matching the scan's primary device. This keeps cwv@desktop from
// escaping through compare.run (and from bypassing the UI's dedicated CWV
// projection) while still making a device-only cache useful.
function selectPackRuns(runs: PackRun[], preferredDevice?: 'mobile' | 'desktop'): Map<string, PackRun> {
  const selected = new Map<string, { priority: number, run: PackRun }>()
  for (const run of runs) {
    const identity = publicPackIdentity(run.packName)
    const priority = identity.device == null ? 0 : identity.device === preferredDevice ? 1 : 2
    const previous = selected.get(identity.packName)
    if (!previous || priority < previous.priority)
      selected.set(identity.packName, { priority, run })
  }
  return new Map(Array.from(selected, ([name, entry]) => [name, entry.run]))
}

interface LoadedPackReport {
  readable: boolean
  report: unknown | null
}

async function loadPackReport(ctx: HandlerCtx, run: PackRun | undefined, side: 'base' | 'current'): Promise<LoadedPackReport> {
  if (!run)
    return { readable: true, report: null }
  if (run.report != null)
    return { readable: true, report: run.report }
  if (!run.reportBlobKey)
    return { readable: false, report: null }

  try {
    const buf = await ctx.storage.blobs.get(run.reportBlobKey)
    if (!buf)
      return { readable: false, report: null }
    return {
      readable: true,
      report: JSON.parse(new TextDecoder().decode(buf)),
    }
  }
  catch (err) {
    logOperationalWarn('compare.pack_cache_read_failed', err, {
      scanId: run.scanId,
      packName: run.packName,
      blobKey: run.reportBlobKey,
      side,
    })
    return { readable: false, report: null }
  }
}

export async function computePackDiffs(ctx: HandlerCtx, baseScanId: ScanId, currentScanId: ScanId): Promise<PackDiff[]> {
  const [baseRuns, currentRuns, baseScan, currentScan] = await Promise.all([
    ctx.storage.packRuns.listForScan(baseScanId).catch((err) => {
      logOperationalWarn('compare.pack_cache_read_failed', err, { scanId: baseScanId, side: 'base' })
      return [] as PackRun[]
    }),
    ctx.storage.packRuns.listForScan(currentScanId).catch((err) => {
      logOperationalWarn('compare.pack_cache_read_failed', err, { scanId: currentScanId, side: 'current' })
      return [] as PackRun[]
    }),
    ctx.storage.scans.get(baseScanId).catch(() => null),
    ctx.storage.scans.get(currentScanId).catch(() => null),
  ])

  const baseByName = selectPackRuns(baseRuns, baseScan?.device)
  const currentByName = selectPackRuns(currentRuns, currentScan?.device)
  const allPacks = new Set([...baseByName.keys(), ...currentByName.keys()])

  return Promise.all(Array.from(allPacks).sort().map(async (packName) => {
    const [baseLoaded, currentLoaded] = await Promise.all([
      loadPackReport(ctx, baseByName.get(packName), 'base'),
      loadPackReport(ctx, currentByName.get(packName), 'current'),
    ])
    const base = baseLoaded.report
    const current = currentLoaded.report
    return {
      packName,
      base,
      current,
      baseSummary: base ? summarisePackReport(base) : null,
      currentSummary: current ? summarisePackReport(current) : null,
      // An unreadable cache entry is not positive evidence of equality. Mark
      // it changed so consumers never receive a false "unchanged" result.
      hasChanges: !baseLoaded.readable || !currentLoaded.readable || !deepEqual(base, current),
    }
  }))
}
