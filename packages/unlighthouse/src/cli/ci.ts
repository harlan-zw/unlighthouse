import type { Device, ScanId } from '@unlighthouse/contracts/types/atoms'
import type { LighthouseReportAudit, LighthouseReportCategory } from '../index.ts'
import type { CiOptions, UnlighthouseRouteReport } from './types'
import { setMaxListeners } from 'node:events'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { compareScans, formatComparisonMarkdown, getComparisonSummary } from '@unlighthouse/core/comparison'
import { createConsola } from 'consola'
import { createUnlighthouseHost } from '../index.ts'
import { generateReportPayload, outputReport } from '../reporters'
import { runAssertions } from './assertions'
import createCli from './createCli'
import { parseDevices, pickOptions, validateHost, validateOptions } from './util'

const cli = createCli()

cli
  .option('--budget <budget>', 'Budget (1-100), the minimum score required for each page to pass.')
  .option('--build-static', 'Build a static version of the Unlighthouse report.')
  .option('--reporter <reporter>', 'The reporter to use. Options: csvExpanded, csv, json, jsonExpanded. Set to false to disable.')
  .option('--no-assert', 'Disable CI assertions. On by default in CI mode.')
  .option('--compare [target]', 'Compare this scan against a previous one. Values: "latest" (default) | <scanId> | <branch>. Regressions cause non-zero exit.')
  .option('--compare-output <path>', 'When using --compare, write a Markdown summary of the diff to this path (suitable for PR comments).')

const { options } = cli.parse() as unknown as { options: CiOptions }

interface RawLighthouseCategory {
  id?: string
  title?: string
  score?: number | null
  categoryScoreDisplayMode?: 'gauge' | 'fraction'
}

interface RawLighthousePayload {
  categories?: Record<string, RawLighthouseCategory>
  audits?: Record<string, LighthouseReportAudit>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function parseLighthousePayload(gzipped: Uint8Array): RawLighthousePayload {
  const parsed = JSON.parse(gunzipSync(gzipped).toString()) as unknown
  if (!isRecord(parsed))
    return {}
  return {
    categories: isRecord(parsed.categories)
      ? parsed.categories as Record<string, RawLighthouseCategory>
      : undefined,
    audits: isRecord(parsed.audits)
      ? parsed.audits as Record<string, LighthouseReportAudit>
      : undefined,
  }
}

function reportRouteFor(row: { path: string, url: string }): UnlighthouseRouteReport['route'] {
  return {
    id: row.path,
    path: row.path,
    url: row.url,
    $url: new URL(row.url),
    definition: {
      name: row.path,
      path: row.path,
    },
  }
}

async function run() {
  if (options.help || options.version)
    return

  const start = new Date()
  setMaxListeners(0)

  const logger = createConsola().withTag('unlighthouse')
  if (options.debug)
    logger.level = 4

  const unlighthouse = await createUnlighthouseHost({
    userConfig: {
      ...pickOptions(options),
      hooks: {
        'resolved-config': async (config) => {
          await validateHost(config, logger)
        },
      },
    },
    behavior: { ws: null, label: 'ci' },
  })

  validateOptions(unlighthouse.resolvedConfig)

  // D-029: forward parsed `--device` matrix into the run overrides so CI
  // runs can exercise mobile + desktop under a single scan id.
  const deviceOverride = parseDevices(options)
  // start() initialises the host ports (and kicks off the scan); the hooks
  // proxy throws if accessed before that. Register scan:complete immediately
  // after — JS runs these synchronous statements before the scan can emit on a
  // later tick, so there's no race with `await completed` below.
  const { scanId } = await unlighthouse.start(
    deviceOverride && deviceOverride.length > 0 ? { device: deviceOverride } : undefined,
  )
  const completed = new Promise<{ completed: number }>((resolve) => {
    unlighthouse.hooks.hook('scan:complete', (payload) => {
      resolve({ completed: payload.summary.completed })
    })
  })
  const { completed: completedCount } = await completed
  const seconds = Math.round((Date.now() - start.getTime()) / 1000)
  logger.success(`Unlighthouse has finished scanning ${unlighthouse.resolvedConfig.site}: ${completedCount} routes in ${seconds}s.`)

  const cliReporter = options.reporter
  const configReporter = unlighthouse.resolvedConfig.ci?.reporter
  const reporter
    = cliReporter === false || configReporter === false
      ? false
      : cliReporter ?? configReporter ?? 'jsonSimple'
  if (reporter) {
    // Hydrate UnlighthouseRouteReport shape from `storage.routes` + LHR blobs;
    // hand off to the existing reporter pipeline (jsonSimple/jsonExpanded/csv).
    const typedScanId = scanId as ScanId
    const { items } = await unlighthouse.handlerCtx.storage.routes.listForScan(typedScanId, { pageSize: 10_000 })
    // D-029: when `--device` narrows the run to a subset, also narrow the
    // export so consumers only see the rows they asked for. Matrix scans
    // (no narrowing, or narrowing to multiple devices) export every (url,
    // device) row — one CSV/JSON row each.
    const exportDeviceFilter = deviceOverride && deviceOverride.length > 0
      ? new Set(deviceOverride)
      : null
    const filtered = exportDeviceFilter
      ? items.filter(r => exportDeviceFilter.has(r.device as Device))
      : items
    const hydrated = await Promise.all(filtered.map(async (r) => {
      const gz = r.lhrBlobKey ? await unlighthouse.handlerCtx.storage.blobs.get(r.lhrBlobKey) : null
      if (!gz)
        return null
      const lhr = parseLighthousePayload(gz)
      const categoriesArr: LighthouseReportCategory[] = Object.entries(lhr.categories ?? {}).map(([key, c]) => ({
        key,
        id: c.id ?? key,
        title: c.title ?? key,
        score: c.score ?? null,
        categoryScoreDisplayMode: c.categoryScoreDisplayMode ?? 'gauge',
      }))
      const gaugeCategories = categoriesArr.filter(c => c.categoryScoreDisplayMode !== 'fraction')
      const scoreAverage = gaugeCategories.length
        ? gaugeCategories.reduce((s, c) => s + (c.score ?? 0), 0) / gaugeCategories.length
        : 0
      const emptyComputedAudit = { score: 0, displayValue: '', details: { items: [] } }
      const report: UnlighthouseRouteReport = {
        route: reportRouteFor(r),
        // D-029: each storage row is one (url, device) audit. Propagate the
        // device through to the reporters so multi-device matrix scans emit
        // distinct rows per form-factor instead of collapsing.
        device: r.device,
        report: {
          score: scoreAverage,
          categories: categoriesArr,
          audits: lhr.audits ?? {},
          computed: {
            imageIssues: emptyComputedAudit,
            ariaIssues: emptyComputedAudit,
          },
        },
        tasks: {
          inspectHtmlTask: 'completed',
          runLighthouseTask: 'completed',
        },
        artifactPath: '',
        artifactUrl: '',
        reportId: r.path,
      }
      return report
    }))
    const reports = hydrated.filter((x): x is NonNullable<typeof x> => x != null)
    const payload = generateReportPayload(reporter, reports)
    const path = await outputReport(reporter, unlighthouse.resolvedConfig, payload)
    if (path)
      logger.success(`Wrote ${reporter} report to ${path}`)
  }

  // #290/#275/#120: build an offline static report embedding a full snapshot
  // (every route incl. the homepage + contract blobs), served by createStaticClient.
  if (options.buildStatic) {
    unlighthouse.runtimeSettings.currentScanId = scanId
    await unlighthouse.generateClient({ static: true })
    logger.success(`Built static report at ${unlighthouse.runtimeSettings.generatedClientPath}`)
  }

  const db = unlighthouse.handlerCtx.storage.db

  const assertionConfigs = unlighthouse.resolvedConfig.ci?.assertions
  const assertEnabled = options.assert !== false
  if (assertEnabled && assertionConfigs?.length && db) {
    const { passed } = await runAssertions(db, scanId, assertionConfigs, logger)
    if (!passed)
      process.exit(1)
  }

  if (options.compare !== undefined && options.compare !== false && db) {
    const target = typeof options.compare === 'string' ? options.compare : 'latest'
    const branch = target === 'latest' ? undefined : target
    let baseScanId: string | undefined

    const asScan = await unlighthouse.handlerCtx.storage.scans.get(target as ScanId)
    if (asScan) {
      baseScanId = asScan.scanId
    }
    else {
      const device = unlighthouse.resolvedConfig.scanner?.device
      const previous = await unlighthouse.handlerCtx.storage.scans.findPrevious({
        site: unlighthouse.resolvedConfig.site,
        device: typeof device === 'string' ? device : 'mobile',
        excludeScanId: scanId,
        branch,
      })
      baseScanId = previous?.scanId
    }

    if (!baseScanId) {
      logOperationalWarn('cli.compare_baseline_missing', null, { target, scanId, branch }, logger)
    }
    else {
      const comparison = await compareScans(db, baseScanId, scanId)
      logger.info(`Comparison vs scan ${baseScanId.slice(0, 8)}: ${comparison.improved} improved, ${comparison.regressed} regressed, ${comparison.unchanged} unchanged, ${comparison.newUrls} new urls, ${comparison.removedUrls} removed urls.`)

      if (options.compareOutput) {
        const full = await getComparisonSummary(db, comparison.id)
        if (full) {
          const markdown = formatComparisonMarkdown(full)
          const outPath = resolve(options.compareOutput)
          writeFileSync(outPath, markdown, 'utf8')
          logger.success(`Wrote comparison markdown to ${outPath}`)
        }
      }

      if (comparison.regressed > 0) {
        logger.error(`Comparison failed: ${comparison.regressed} route(s) regressed beyond threshold.`)
        process.exit(1)
      }
    }
  }

  process.exit(0)
}

run()
