import type { ReporterConfig } from '../reporters/types'
import type { CiOptions } from './types'
import { setMaxListeners } from 'node:events'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compareScans, formatComparisonMarkdown, getComparisonSummary } from '@unlighthouse/core/comparison'
import { createUnlighthouse, evaluateAndStoreAssertions, history, useLogger } from '..'
import { getCurrentScanId } from '../data/history/tracking'
import { generateReportPayload, outputReport } from '../reporters'
import createCli from './createCli'
import { pickOptions, validateHost, validateOptions } from './util'

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

  const unlighthouse = await createUnlighthouse(
    {
      ...pickOptions(options),
      hooks: {
        'resolved-config': async (config) => {
          await validateHost(config)
        },
      },
    },
    { name: 'ci' },
    { ws: null, label: 'ci' },
  )

  validateOptions(unlighthouse.resolvedConfig)

  const logger = useLogger()
  const { routes = [] } = await unlighthouse.start()
  if (!routes.length) {
    logger.error('Failed to queue routes for scanning. Please check the logs with debug enabled.')
    process.exit(1)
  }

  await new Promise<void>((resolve) => {
    unlighthouse.hooks.hook('worker-finished', async () => {
      unlighthouse.worker.clearProgressDisplay()
      const seconds = Math.round((Date.now() - start.getTime()) / 1000)
      logger.success(`Unlighthouse has finished scanning ${unlighthouse.resolvedConfig.site}: ${unlighthouse.worker.reports().length} routes in ${seconds}s.`)
      await unlighthouse.worker.cluster.close().catch(() => {})
      resolve()
    })
  })

  // Generate the configured report file. Defaults to `jsonSimple` when neither
  // CLI nor config file specify one; `false` opts out.
  const cliReporter = options.reporter
  const configReporter = unlighthouse.resolvedConfig.ci?.reporter
  const reporter
    = cliReporter === false || configReporter === false
      ? false
      : cliReporter ?? configReporter ?? 'jsonSimple'
  if (reporter) {
    const reporterConfig: ReporterConfig = {
      columns: unlighthouse.resolvedConfig.client?.columns,
      ...(unlighthouse.resolvedConfig.ci?.reporterConfig ?? {}),
    }
    const payload = await Promise.resolve<unknown>(
      generateReportPayload(reporter as never, unlighthouse.worker.reports(), reporterConfig),
    )
    if (payload != null) {
      const path = await outputReport(reporter, unlighthouse.resolvedConfig, payload)
      logger.success(`Generated \`${reporter}\` report: ${path}`)
    }
  }

  // Assertions default to on in CI; --no-assert opts out.
  const assertionConfigs = unlighthouse.resolvedConfig.ci?.assertions
  const assertEnabled = options.assert !== false
  if (assertEnabled && assertionConfigs?.length) {
    const scanId = getCurrentScanId()
    if (scanId) {
      const db = history.getHistoryDb(unlighthouse.resolvedConfig.outputPath)
      const results = evaluateAndStoreAssertions(db, scanId, assertionConfigs)
      const failures = results.filter(r => !r.passed)

      if (failures.length > 0) {
        logger.error(`${failures.length} assertion(s) failed:`)
        for (const f of failures) {
          const label = f.assertion.category || f.assertion.metric || f.assertion.type
          logger.error(`  ${f.assertion.type} ${label}: expected ${f.assertion.value}, got ${f.actual}`)
          if (f.failingRoutes?.length) {
            for (const r of f.failingRoutes.slice(0, 5))
              logger.error(`    - ${r.path} (${r.value})`)
            if (f.failingRoutes.length > 5)
              logger.error(`    ... and ${f.failingRoutes.length - 5} more`)
          }
        }
        process.exit(1)
      }
      logger.success(`All ${results.length} assertion(s) passed.`)
    }
  }

  // --compare: diff this scan against a previous scan and fail on regressions.
  if (options.compare !== undefined && options.compare !== false) {
    const scanId = getCurrentScanId()
    const outputPath = unlighthouse.resolvedConfig.outputPath
    const db = history.getHistoryDb(outputPath)
    if (!scanId) {
      logger.warn('--compare skipped: no active scan id')
    }
    else {
      const target = typeof options.compare === 'string' ? options.compare : 'latest'
      let baseScanId: string | undefined

      // Direct scan id: any 8+ hex chars with dashes. Try it as an id first.
      const asScan = history.getScan(outputPath, target)
      if (asScan) {
        baseScanId = asScan.id
      }
      else {
        const branch = target === 'latest' ? undefined : target
        const device = unlighthouse.resolvedConfig.scanner?.device
        const previous = history.findPreviousScan(outputPath, {
          site: unlighthouse.resolvedConfig.site,
          device: typeof device === 'string' ? device : undefined,
          excludeScanId: scanId,
          branch,
        })
        baseScanId = previous?.id
      }

      if (!baseScanId) {
        logger.warn(`--compare: no previous scan found for target "${target}", skipping.`)
      }
      else {
        const comparison = await compareScans(db, baseScanId, scanId)
        logger.info(`Comparison vs scan ${baseScanId.slice(0, 8)}: ${comparison.improved} improved, ${comparison.regressed} regressed, ${comparison.unchanged} unchanged, ${comparison.newUrls} new urls, ${comparison.removedUrls} removed urls.`)

        if (options.compareOutput) {
          const full = getComparisonSummary(db, comparison.id)
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
  }

  process.exit(0)
}

run()
