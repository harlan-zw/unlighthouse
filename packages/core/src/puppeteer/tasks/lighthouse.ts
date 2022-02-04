import fs from 'fs-extra'
import type { LH } from 'lighthouse'
import flatten from 'lodash/flatten'
import pick from 'lodash/pick'
import sumBy from 'lodash/sumBy'
import { computeMedianRun } from 'lighthouse/lighthouse-core/lib/median-run.js'
import type { LighthouseReport, PuppeteerTask } from '../../types'
import { useUnlighthouse } from '../../unlighthouse'
import { useLogger } from '../../logger'

export const normaliseLighthouseResult = (result: LH.Result): LighthouseReport => {
  const { resolvedConfig } = useUnlighthouse()

  const measuredCategories = Object.values(result.categories)
    .filter(c => typeof c.score !== 'undefined') as { score: number }[]

  const columnFields = Object.values(resolvedConfig.client.columns)
    .flat()
    .filter(c => !!c.key)
    .map(c => c.key?.replace('report.', '')) as string[]

  const imageIssues = flatten([
    result.audits['unsized-images']?.details?.items || [],
    result.audits['preload-lcp-image']?.details?.items || [],
    result.audits['offscreen-images']?.details?.items || [],
    result.audits['modern-image-formats']?.details?.items || [],
    result.audits['uses-optimized-images']?.details?.items || [],
    result.audits['efficient-animated-content']?.details?.items || [],
    result.audits['uses-responsive-images']?.details?.items || [],
  ])
  const ariaIssues = flatten(Object.values(result.audits)
    .filter(a => a && a.id.startsWith('aria-') && a.details?.items?.length > 0)
    .map(a => a.details?.items),
  )
  // map the json report to what values we actually need
  return {
    ...pick(result, [
      'categories',
      'audits.redirects',
      'audits.final-screenshot',
      // performance computed
      'audits.first-contentful-paint',
      'audits.total-blocking-time',
      'audits.max-potential-fid',
      'audits.interactive',
      ...columnFields,
    ]),
    computed: {
      imageIssues: {
        details: {
          items: imageIssues,
        },
        displayValue: imageIssues.length,
        score: imageIssues.length > 0 ? 0 : 1,
      },
      ariaIssues: {
        details: {
          items: ariaIssues,
        },
        displayValue: ariaIssues.length,
        score: ariaIssues.length > 0 ? 0 : 1,
      },
    },
    score: Math.round(sumBy(measuredCategories, 'score') / measuredCategories.length * 100) / 100,
  }
}

export const runLighthouseTask: PuppeteerTask = async(props) => {
  const logger = useLogger()
  const { resolvedConfig, runtimeSettings, worker } = useUnlighthouse()
  const { page, data: routeReport } = props

  // if the report doesn't exist we're going to run a new lighthouse process to generate it
  if (resolvedConfig.cache && fs.existsSync(routeReport.reportJson)) {
    const report = fs.readJsonSync(routeReport.reportJson, { encoding: 'utf-8' }) as LH.Result
    routeReport.report = normaliseLighthouseResult(report)
    logger.success(`Completed \`runLighthouseTask\` for \`${routeReport.route.path}\` using cache. [Score \`${routeReport.report.score}\`]`)
    return routeReport
  }

  const browser = page.browser()
  const port = new URL(browser.wsEndpoint()).port
  // ignore csp errors
  await page.setBypassCSP(true)

  const args = [
    `--cache=${JSON.stringify(resolvedConfig.cache)}`,
    `--routeReport=${JSON.stringify(pick(routeReport, ['route.url', 'reportJson', 'reportHtml']))}`,
    `--lighthouseOptions=${JSON.stringify(resolvedConfig.lighthouseOptions)}`,
    `--port=${port}`,
  ]

  const samples = []
  for (let i = 0; i < resolvedConfig.scanner.samples; i++) {
    try {
      // Spawn a worker process
      const worker = (await import('execa'))
        .execa(
          // handles stubbing
          runtimeSettings.lighthouseProcessPath.endsWith('.ts') ? 'jiti' : 'node',
          [runtimeSettings.lighthouseProcessPath, ...args],
          {
            timeout: 6 * 60 * 1000,
          },
        )
      worker.stdout!.pipe(process.stdout)
      worker.stderr!.pipe(process.stderr)
      const res = await worker
      if (res)
        samples.push(fs.readJsonSync(routeReport.reportJson))
    }
    catch (e) {
      logger.error('Failed to run lighthouse for route', e)
      return routeReport
    }
  }

  let report = samples[0]
  if (samples.length > 1) {
    try {
      report = computeMedianRun(samples)
    }
    catch (e) {
      logger.warn('Error when computing median score, possibly audit failed.', e)
    }
  }

  if (!report) {
    logger.error(`Task \`runLighthouseTask\` has failed to run for path "${routeReport.route.path}".`)
    routeReport.tasks.runLighthouseTask = 'failed'
  }
  routeReport.report = normaliseLighthouseResult(report)
  logger.success(`Completed \`runLighthouseTask\` for \`${routeReport.route.path}\`. [Score: \`${routeReport.report.score}\`${resolvedConfig.scanner.samples ? ` Samples: ${resolvedConfig.scanner.samples}` : ''} ${worker.monitor().donePercStr}% complete]`)
  return routeReport
}
