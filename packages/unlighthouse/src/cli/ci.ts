import type { LighthouseReportCategory } from '../index.ts'
import type { CiOptions, UnlighthouseRouteReport } from './types'
import { setMaxListeners } from 'node:events'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { parseScanId } from '@unlighthouse/contracts/types/atoms'
import { compareScans, formatComparisonMarkdown, getComparisonSummary } from '@unlighthouse/core/comparison'
import { parseRouteContract, routeContractBlobKey } from '@unlighthouse/core/report'
import { createConsola } from 'consola'
import { createUnlighthouseHost } from '../index.ts'
import { generateReportPayload, outputReport } from '../reporters'
import { runAssertions } from './assertions'
import { createCiBaseCli } from './cac-base'
import { parseDevices, pickOptions, resolveCiReporter, validateHost, validateOptions } from './util'

export interface CiEntryOptions {
  /** Full process-style argv, including node and script entries. */
  argv?: string[]
  /** Environment captured at the executable boundary. */
  env?: NodeJS.ProcessEnv
}

/** Build the CI parser without parsing arguments or starting a scan. */
export function createCiCli() {
  return createCiBaseCli()
    .option('--budget <budget>', 'Budget (1-100), the minimum score required for each page to pass.')
    .option('--build-static', 'Build a static version of the Unlighthouse report.')
    .option('--reporter <reporter>', 'The reporter to use. Options: csvExpanded, csv, json, jsonExpanded. Set to false to disable.')
    .option('--no-assert', 'Disable CI assertions. On by default in CI mode.')
    .option('--compare [target]', 'Compare this scan against a previous one. Values: "latest" (default) | <scanId> | <branch>. Regressions cause non-zero exit.')
    .option('--compare-output <path>', 'When using --compare, write a Markdown summary of the diff to this path (suitable for PR comments).')
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

/** Run CI and return the desired process exit code. Importing this module is inert. */
export async function runCi(entry: CiEntryOptions = {}): Promise<number> {
  const env = entry.env ?? process.env
  // cac exposes parsed options as `any`; constrain that upstream boundary once
  // so the runner stays on the owned CiOptions contract.
  const options = createCiCli().parse(entry.argv ?? process.argv).options as CiOptions
  if (options.help || options.version)
    return 0

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
    env,
  })

  validateOptions(unlighthouse.resolvedConfig)

  // D-029: forward parsed `--device` matrix into the run overrides so CI
  // runs can exercise mobile + desktop under a single scan id.
  const deviceOverride = parseDevices(options)
  // Await the session's completion contract directly. A pending hook promise
  // does not keep Node alive, so a failed scan could previously let the CI
  // process exit 0 without producing its report.
  const session = await unlighthouse.start(
    deviceOverride && deviceOverride.length > 0 ? { device: deviceOverride } : undefined,
  )
  const { scanId } = session
  const { summary } = await session.done
  const completedCount = summary.completed
  const seconds = Math.round((Date.now() - start.getTime()) / 1000)

  // A CI run with no usable route results cannot satisfy budgets or produce a
  // meaningful report. Treat it as a failed run instead of writing an empty
  // artifact and exiting successfully (which masks crawler/auditor failures).
  if (completedCount === 0) {
    logger.error(`Unlighthouse finished with no successful routes (${summary.failed} failed) after ${seconds}s.`)
    return 1
  }

  logger.success(`Unlighthouse has finished scanning ${unlighthouse.resolvedConfig.site}: ${completedCount} routes in ${seconds}s.`)

  const reporter = resolveCiReporter(options.reporter, unlighthouse.resolvedConfig.ci?.reporter)
  if (reporter) {
    // Hydrate UnlighthouseRouteReport shape from `storage.routes` + LHR blobs;
    // hand off to the existing reporter pipeline (jsonSimple/jsonExpanded/csv).
    const { items } = await unlighthouse.handlerCtx.storage.routes.listForScan(scanId, { pageSize: 10_000 })
    // D-029: when `--device` narrows the run to a subset, also narrow the
    // export so consumers only see the rows they asked for. Matrix scans
    // (no narrowing, or narrowing to multiple devices) export every (url,
    // device) row — one CSV/JSON row each.
    const exportDeviceFilter = deviceOverride && deviceOverride.length > 0
      ? new Set(deviceOverride)
      : null
    const filtered = exportDeviceFilter
      ? items.filter(r => exportDeviceFilter.has(r.device))
      : items
    const hydrated = await Promise.all(filtered.map(async (r) => {
      // D-034: read the reconciled report (the LH-version-isolated projection),
      // not the raw LHR. `categories` (score + display mode) and `audits`
      // (score / scoreDisplayMode / numericValue / displayValue) are all the
      // reporters need; category `id`/`title` fall back to the key and audit
      // `numericUnit` is dropped (the expected lossy fields — Step G).
      const contractKey = routeContractBlobKey(r)
      const blob = contractKey ? await unlighthouse.handlerCtx.storage.blobs.get(contractKey) : null
      const contract = blob ? parseRouteContract(blob) : null
      if (!contract)
        return null
      const categoriesArr: LighthouseReportCategory[] = Object.entries(contract.categories).map(([key, c]) => ({
        key,
        id: key,
        title: key,
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
          audits: contract.audits,
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
      return 1
  }

  if (options.compare !== undefined && options.compare !== false && db) {
    const target = typeof options.compare === 'string' ? options.compare : 'latest'
    const branch = target === 'latest' ? undefined : target
    let baseScanId: string | undefined

    const asScan = await unlighthouse.handlerCtx.storage.scans.get(parseScanId(target))
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
        return 1
      }
    }
  }

  return 0
}
