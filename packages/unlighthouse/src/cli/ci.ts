import type { CiOptions } from './types'
import { setMaxListeners } from 'node:events'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
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

  const completed = new Promise<{ completed: number }>((resolve) => {
    unlighthouse.hooks.hook('scan:complete', (payload) => {
      resolve({ completed: payload.summary.completed })
    })
  })

  // D-029: forward parsed `--device` matrix into the run overrides so CI
  // runs can exercise mobile + desktop under a single scan id.
  const deviceOverride = parseDevices(options)
  const { scanId } = await unlighthouse.start(
    deviceOverride && deviceOverride.length > 0 ? { device: deviceOverride } : undefined,
  )
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
    const { items } = await unlighthouse.handlerCtx.storage.routes.listForScan(scanId as never, { pageSize: 10_000 })
    // D-029: when `--device` narrows the run to a subset, also narrow the
    // export so consumers only see the rows they asked for. Matrix scans
    // (no narrowing, or narrowing to multiple devices) export every (url,
    // device) row — one CSV/JSON row each.
    const exportDeviceFilter = deviceOverride && deviceOverride.length > 0
      ? new Set(deviceOverride)
      : null
    const filtered = exportDeviceFilter
      ? items.filter(r => exportDeviceFilter.has(r.device as never))
      : items
    const hydrated = await Promise.all(filtered.map(async (r) => {
      const gz = r.lhrBlobKey ? await unlighthouse.handlerCtx.storage.blobs.get(r.lhrBlobKey) : null
      if (!gz)
        return null
      const lhr = JSON.parse(gunzipSync(gz).toString())
      const categoriesArr = Object.values(lhr.categories ?? {}).map((c: any) => ({
        key: c.id,
        id: c.id,
        title: c.title,
        score: c.score,
      }))
      const scoreAverage = categoriesArr.length
        ? categoriesArr.reduce((s, c) => s + (c.score ?? 0), 0) / categoriesArr.length
        : 0
      return {
        route: { path: r.path, url: r.url },
        // D-029: each storage row is one (url, device) audit. Propagate the
        // device through to the reporters so multi-device matrix scans emit
        // distinct rows per form-factor instead of collapsing.
        device: r.device,
        report: {
          score: scoreAverage,
          categories: categoriesArr,
          audits: lhr.audits,
        },
        tasks: {},
        artifactPath: '',
        artifactUrl: '',
        reportId: r.path,
      } as never
    }))
    const reports = hydrated.filter((x): x is NonNullable<typeof x> => x != null)
    const payload = generateReportPayload(reporter as never, reports as never)
    const path = await outputReport(reporter, unlighthouse.resolvedConfig, payload)
    if (path)
      logger.success(`Wrote ${reporter} report to ${path}`)
  }

  // #290/#275/#120: build an offline static report embedding a full snapshot
  // (every route incl. the homepage + contract blobs), served by createStaticClient.
  if (options.buildStatic) {
    unlighthouse.runtimeSettings.currentScanId = scanId as never
    await unlighthouse.generateClient({ static: true })
    logger.success(`Built static report at ${unlighthouse.runtimeSettings.generatedClientPath}`)
  }

  const db = (unlighthouse.handlerCtx.storage as { db?: any }).db

  const assertionConfigs = unlighthouse.resolvedConfig.ci?.assertions
  const assertEnabled = options.assert !== false
  if (assertEnabled && assertionConfigs?.length && db) {
    const { passed } = await runAssertions(db, scanId, assertionConfigs, logger)
    if (!passed)
      process.exit(1)
  }

  if (options.compare !== undefined && options.compare !== false && db) {
    const target = typeof options.compare === 'string' ? options.compare : 'latest'
    let baseScanId: string | undefined

    const asScan = await unlighthouse.handlerCtx.storage.scans.get(target as never)
    if (asScan) {
      baseScanId = asScan.scanId
    }
    else {
      const branch = target === 'latest' ? undefined : target
      const device = unlighthouse.resolvedConfig.scanner?.device
      const previous = await unlighthouse.handlerCtx.storage.scans.findPrevious({
        site: unlighthouse.resolvedConfig.site,
        device: typeof device === 'string' ? (device as never) : ('mobile' as never),
        excludeScanId: scanId as never,
        branch,
      })
      baseScanId = previous?.scanId
    }

    if (!baseScanId) {
      logger.warn(`--compare: no previous scan found for target "${target}", skipping.`)
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
