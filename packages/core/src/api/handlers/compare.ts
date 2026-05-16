// compare.* handlers — operate on the v2 Storage port (ScanRoute rows).

import type {
  Category,
  CommandOutput,
  CompareFindPrevious,
  CompareMarkdown,
  CompareRun,
  MetricName,
  ScanRoute,
} from '@unlighthouse/contracts'
import type { Handler, HandlerCtx } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts'

const DEFAULT_THRESHOLDS: Record<string, number> = {
  'lcp': 500,
  'cls': 0.1,
  'tbt': 200,
  'fcp': 300,
  'si': 500,
  'ttfb': 200,
  'inp': 200,
  'performance': 0.05,
  'accessibility': 0.05,
  'best-practices': 0.05,
  'seo': 0.05,
}

const CATEGORY_COL: Record<string, keyof ScanRoute> = {
  'performance': 'scorePerformance',
  'accessibility': 'scoreAccessibility',
  'seo': 'scoreSeo',
  'best-practices': 'scoreBestPractices',
}

function valueOf(route: ScanRoute, metric: MetricName | Category): number | null {
  const cat = CATEGORY_COL[metric as string]
  if (cat)
    return (route as unknown as Record<string, number | null>)[cat as string]
  return (route as unknown as Record<string, number | null>)[metric as string] ?? null
}

interface Diff {
  url: string
  // D-029: matrix scans key diffs on (url, device) so mobile and desktop
  // regressions don't collapse. Mirrors the RouteDiff contract atom.
  device: ScanRoute['device']
  metric: MetricName | Category
  base: number | null
  current: number | null
  delta: number
  regressed: boolean
}

// D-029: row key for cross-scan join. baseByUrl was URL-only before; matrix
// scans have multiple rows per URL so the URL alone overwrites every prior
// device's row when building the map. (url, device) restores 1:1 lookup.
function rowKey(r: ScanRoute): string {
  return `${r.url}|${r.device}`
}

async function loadRoutes(ctx: HandlerCtx, scanId: string): Promise<ScanRoute[]> {
  const scan = await ctx.storage.scans.get(scanId as unknown as never)
  if (!scan)
    throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${scanId}` })
  const res = await ctx.storage.routes.listForScan(scanId as unknown as never, { page: 1, pageSize: 10_000 })
  return res.items
}

async function runCompare(ctx: HandlerCtx, baseScanId: string, currentScanId: string, thresholds?: Record<string, number>) {
  const resolvedThresholds = { ...DEFAULT_THRESHOLDS, ...(thresholds ?? {}) }
  const [baseRoutes, currentRoutes] = await Promise.all([
    loadRoutes(ctx, baseScanId),
    loadRoutes(ctx, currentScanId),
  ])
  const baseByKey = new Map(baseRoutes.map(r => [rowKey(r), r]))

  const metrics: (MetricName | Category)[] = [
    'lcp',
    'cls',
    'inp',
    'fcp',
    'ttfb',
    'tbt',
    'si',
    'performance',
    'accessibility',
    'seo',
    'best-practices',
  ]
  const isScore = (m: MetricName | Category) => !!CATEGORY_COL[m as string]

  const regressions: Diff[] = []
  const improvements: Diff[] = []

  for (const current of currentRoutes) {
    // Match base to current on (url, device). A matrix scan compared against
    // a single-device base will still find pairs for the overlapping device
    // and skip the rest — no false regressions from missing base rows.
    const base = baseByKey.get(rowKey(current))
    if (!base)
      continue
    for (const metric of metrics) {
      const baseVal = valueOf(base, metric)
      const currentVal = valueOf(current, metric)
      if (baseVal == null || currentVal == null)
        continue
      const delta = currentVal - baseVal
      const threshold = resolvedThresholds[metric as string] ?? 0
      const score = isScore(metric)
      const regressed = score ? -delta > threshold : delta > threshold
      const improved = score ? delta > threshold : -delta > threshold
      if (regressed || improved) {
        const diff: Diff = {
          url: current.url,
          device: current.device,
          metric,
          base: baseVal,
          current: currentVal,
          delta,
          regressed,
        }
        ;(regressed ? regressions : improvements).push(diff)
      }
    }
  }

  return {
    baseScanId,
    currentScanId,
    regressions,
    improvements,
    thresholds: resolvedThresholds,
  }
}

export const compareRun: Handler<typeof CompareRun> = {
  command: {} as typeof CompareRun,
  async run(input, ctx) {
    const report = await runCompare(ctx, input.baseScanId, input.currentScanId, input.thresholds)
    await emitCompareComplete(ctx, input.baseScanId, input.currentScanId, report.regressions.length, report.improvements.length)
    return report as unknown as CommandOutput<typeof CompareRun>
  },
}

async function emitCompareComplete(ctx: HandlerCtx, baseScanId: string, currentScanId: string, regressions: number, improvements: number) {
  const hooks = ctx.core.hooks as { callHook: (event: string, payload: unknown) => Promise<void> } | undefined
  await hooks?.callHook('compare:complete', { baseScanId, currentScanId, regressions, improvements })
}

export const compareMarkdown: Handler<typeof CompareMarkdown> = {
  command: {} as typeof CompareMarkdown,
  async run(input, ctx) {
    const report = await runCompare(ctx, input.baseScanId, input.currentScanId, input.thresholds)
    await emitCompareComplete(ctx, input.baseScanId, input.currentScanId, report.regressions.length, report.improvements.length)
    const title = input.title ?? 'Unlighthouse comparison'
    const lines: string[] = []
    const icon = report.regressions.length ? 'X' : report.improvements.length ? 'OK' : 'info'
    lines.push(`## ${icon} ${title}`)
    lines.push('')
    lines.push(`- Regressions: ${report.regressions.length}`)
    lines.push(`- Improvements: ${report.improvements.length}`)
    lines.push('')
    lines.push(`_Base \`${input.baseScanId.slice(0, 8)}\` → Current \`${input.currentScanId.slice(0, 8)}\`_`)
    const renderTable = (rows: Diff[], heading: string) => {
      if (!rows.length)
        return
      lines.push('')
      lines.push(`### ${heading}`)
      lines.push('')
      lines.push('| Route | Device | Metric | Base | Current | Δ |')
      lines.push('|-------|--------|--------|------|---------|---|')
      for (const r of rows)
        lines.push(`| \`${r.url}\` | ${r.device} | ${r.metric} | ${r.base ?? '—'} | ${r.current ?? '—'} | ${r.delta.toFixed(3)} |`)
    }
    renderTable(report.regressions, 'Regressions')
    renderTable(report.improvements, 'Improvements')
    return {
      markdown: `${lines.join('\n')}\n`,
      hasRegressions: report.regressions.length > 0,
    } as CommandOutput<typeof CompareMarkdown>
  },
}

export const compareFindPrevious: Handler<typeof CompareFindPrevious> = {
  command: {} as typeof CompareFindPrevious,
  async run(input, ctx) {
    const previous = await ctx.storage.scans.findPrevious({
      site: input.site,
      device: input.device,
      branch: input.branch,
      excludeScanId: input.excludeScanId,
    })
    return { scanId: previous?.scanId ?? null } as CommandOutput<typeof CompareFindPrevious>
  },
}
