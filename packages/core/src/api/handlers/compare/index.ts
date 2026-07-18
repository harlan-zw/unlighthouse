// compare.* handlers operate on the v2 Storage port (ScanRoute rows).

import type {
  Category,
  ScanId,
} from '@unlighthouse/contracts/types/atoms'
import type { Handler, HandlerCtx } from '../types'
import { CompareDetail, CompareFindPrevious, CompareMarkdown, CompareRun } from '@unlighthouse/contracts/commands'
import {
  categoryDeltasFromSummaries,
  compareRoutes,
  selectDetailRows,
} from '../../../comparison/policy'
import { loadScanRoutes } from '../scan-routes'
import { renderCompareMarkdown } from './markdown'
import { computePackDiffs } from './pack-diffs'

async function runCompare(ctx: HandlerCtx, baseScanId: ScanId, currentScanId: ScanId, thresholds?: Record<string, number>) {
  const [baseRoutes, currentRoutes] = await Promise.all([
    loadScanRoutes(ctx.storage, baseScanId),
    loadScanRoutes(ctx.storage, currentScanId),
  ])
  const comparison = compareRoutes({ baseRoutes, currentRoutes, thresholds })

  return {
    baseScanId,
    currentScanId,
    regressions: comparison.regressions,
    improvements: comparison.improvements,
    added: comparison.added,
    removed: comparison.removed,
    thresholds: comparison.thresholds,
    summary: null,
    packDiffs: [],
  }
}

export const compareRun: Handler<typeof CompareRun> = {
  command: CompareRun,
  async run(input, ctx) {
    const report = await runCompare(ctx, input.baseScanId, input.currentScanId, input.thresholds)

    const [baseScan, currentScan, packDiffs] = await Promise.all([
      ctx.storage.scans.get(input.baseScanId),
      ctx.storage.scans.get(input.currentScanId),
      computePackDiffs(ctx, input.baseScanId, input.currentScanId),
    ])

    const baseAvg = baseScan?.summary?.scoreAverage ?? null
    const currentAvg = currentScan?.summary?.scoreAverage ?? null
    const categoryDeltas = categoryDeltasFromSummaries(
      baseScan?.summary?.scoresByCategory as Partial<Record<Category, number>> | null | undefined,
      currentScan?.summary?.scoresByCategory as Partial<Record<Category, number>> | null | undefined,
    )

    const output = {
      ...report,
      summary: {
        totalRegressions: report.regressions.length,
        totalImprovements: report.improvements.length,
        avgScoreDelta: baseAvg != null && currentAvg != null ? currentAvg - baseAvg : null,
        categoryDeltas,
      },
      packDiffs,
    }

    await emitCompareComplete(ctx, input.baseScanId, input.currentScanId, output.regressions.length, output.improvements.length)
    return CompareRun.output.parse(output)
  },
}

export const compareDetail: Handler<typeof CompareDetail> = {
  command: CompareDetail,
  async run(input, ctx) {
    const [baseRoutes, currentRoutes, baseScan, currentScan] = await Promise.all([
      loadScanRoutes(ctx.storage, input.baseScanId),
      loadScanRoutes(ctx.storage, input.currentScanId),
      ctx.storage.scans.get(input.baseScanId),
      ctx.storage.scans.get(input.currentScanId),
    ])

    const comparison = compareRoutes({
      baseRoutes,
      currentRoutes,
      thresholds: input.thresholds,
    })
    const filtered = selectDetailRows(comparison.rows, input.filter ?? {}, input.sort || 'delta-perf-desc')

    const total = filtered.length
    const page = input.page ?? 1
    const pageSize = input.pageSize ?? 100
    const start = (page - 1) * pageSize
    const items = filtered.slice(start, start + pageSize)

    const baseAvg = baseScan?.summary?.scoreAverage ?? null
    const currentAvg = currentScan?.summary?.scoreAverage ?? null
    const categoryDeltas = categoryDeltasFromSummaries(
      baseScan?.summary?.scoresByCategory as Partial<Record<Category, number>> | null | undefined,
      currentScan?.summary?.scoresByCategory as Partial<Record<Category, number>> | null | undefined,
    )

    return CompareDetail.output.parse({
      baseScanId: input.baseScanId,
      currentScanId: input.currentScanId,
      summary: {
        totalRoutes: comparison.rows.length,
        changedRoutes: comparison.counts.regressed + comparison.counts.improved + comparison.counts.added + comparison.counts.removed,
        regressedRoutes: comparison.counts.regressed,
        improvedRoutes: comparison.counts.improved,
        addedRoutes: comparison.counts.added,
        removedRoutes: comparison.counts.removed,
        avgScoreDelta: baseAvg != null && currentAvg != null ? currentAvg - baseAvg : null,
        categoryDeltas,
      },
      routes: { items, total, page, pageSize },
    })
  },
}

export const compareMarkdown: Handler<typeof CompareMarkdown> = {
  command: CompareMarkdown,
  async run(input, ctx) {
    const report = await runCompare(ctx, input.baseScanId, input.currentScanId, input.thresholds)
    const [baseScan, currentScan] = await Promise.all([
      ctx.storage.scans.get(input.baseScanId),
      ctx.storage.scans.get(input.currentScanId),
    ])

    const markdown = renderCompareMarkdown({
      title: input.title ?? 'Unlighthouse comparison',
      baseScanId: input.baseScanId,
      currentScanId: input.currentScanId,
      thresholds: report.thresholds,
      regressions: report.regressions,
      improvements: report.improvements,
      added: report.added,
      removed: report.removed,
      categoryDeltas: categoryDeltasFromSummaries(
        baseScan?.summary?.scoresByCategory,
        currentScan?.summary?.scoresByCategory,
      ),
      overallBase: baseScan?.summary?.scoreAverage ?? null,
      overallCurrent: currentScan?.summary?.scoreAverage ?? null,
    })

    return CompareMarkdown.output.parse({
      markdown,
      hasRegressions: report.regressions.length > 0,
    })
  },
}

export const compareFindPrevious: Handler<typeof CompareFindPrevious> = {
  command: CompareFindPrevious,
  async run(input, ctx) {
    const previous = await ctx.storage.scans.findPrevious({
      site: input.site,
      device: input.device,
      branch: input.branch,
      excludeScanId: input.excludeScanId,
    })
    return CompareFindPrevious.output.parse({ scanId: previous?.scanId ?? null })
  },
}

async function emitCompareComplete(ctx: HandlerCtx, baseScanId: string, currentScanId: string, regressions: number, improvements: number) {
  const hooks = ctx.core.hooks as { callHook: (event: string, payload: unknown) => Promise<void> } | undefined
  await hooks?.callHook('compare:complete', { baseScanId, currentScanId, regressions, improvements })
}
