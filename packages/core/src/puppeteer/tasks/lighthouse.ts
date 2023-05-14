import { join } from 'node:path'
import fs from 'fs-extra'
import type { LH } from 'lighthouse'
import { map, pick, sumBy } from 'lodash-es'
import { computeMedianRun } from 'lighthouse/lighthouse-core/lib/median-run.js'
import chalk from 'chalk'
import type { LighthouseReport, PuppeteerTask } from '../../types'
import { useUnlighthouse } from '../../unlighthouse'
import { useLogger } from '../../logger'
import { ReportArtifacts, base64ToBuffer } from '../../util'

export function normaliseLighthouseResult(result: LH.Result): LighthouseReport {
  const { resolvedConfig } = useUnlighthouse()

  const measuredCategories = Object.values(result.categories)
    .filter(c => typeof c.score !== 'undefined') as { score: number }[]

  const columnFields = Object.values(resolvedConfig.client.columns)
    .flat()
    .filter(c => !!c.key)
    .map(c => c.key?.replace('report.', '')) as string[]

  const imageIssues = [
    result.audits['unsized-images']?.details?.items || [],
    result.audits['preload-lcp-image']?.details?.items || [],
    result.audits['offscreen-images']?.details?.items || [],
    result.audits['modern-image-formats']?.details?.items || [],
    result.audits['uses-optimized-images']?.details?.items || [],
    result.audits['efficient-animated-content']?.details?.items || [],
    result.audits['uses-responsive-images']?.details?.items || [],
  ].flat()
  const ariaIssues = Object.values(result.audits)
    .filter(a => a && a.id.startsWith('aria-') && a.details?.items?.length > 0)
    .map(a => a.details?.items)
    .flat()
  // map the json report to what values we actually need
  return {
    // @ts-expect-error type override
    categories: map(result.categories, (c, k) => {
      return {
        key: k,
        id: k,
        ...pick(c, ['title', 'score']),
      }
    }),
    ...pick(result, [
      'audits.redirects',
      // core web vitals
      'audits.layout-shift-elements',
      'audits.largest-contentful-paint-element',
      'audits.largest-contentful-paint',
      'audits.cumulative-layout-shift',
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

export const runLighthouseTask: PuppeteerTask = async (props) => {
  const logger = useLogger()
  const { resolvedConfig, runtimeSettings, worker, hooks } = useUnlighthouse()
  const { page, data: routeReport } = props

  // if the report doesn't exist, we're going to run a new lighthouse process to generate it
  const reportJsonPath = join(routeReport.artifactPath, ReportArtifacts.reportJson)
  if (resolvedConfig.cache && fs.existsSync(reportJsonPath)) {
    const report = fs.readJsonSync(reportJsonPath, { encoding: 'utf-8' }) as LH.Result
    routeReport.report = normaliseLighthouseResult(report)
    return routeReport
  }

  const browser = page.browser()
  const port = new URL(browser.wsEndpoint()).port
  // ignore csp errors
  await page.setBypassCSP(true)

  if (resolvedConfig.auth)
    await page.authenticate(resolvedConfig.auth)

  if (resolvedConfig.cookies)
    await page.setCookie(...resolvedConfig.cookies)

  if (resolvedConfig.extraHeaders)
    await page.setExtraHTTPHeaders(resolvedConfig.extraHeaders)

  // Wait for Lighthouse to open url, then allow hook to run
  browser.on('targetchanged', async (target) => {
    const page = await target.page()
    if (page)
      await hooks.callHook('puppeteer:before-goto', page)
  })

  // allow changing behaviour of the page

  const args = [
    `--cache=${JSON.stringify(resolvedConfig.cache)}`,
    `--routeReport=${JSON.stringify(pick(routeReport, ['route.url', 'artifactPath']))}`,
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
        samples.push(fs.readJsonSync(reportJsonPath))
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
  // export the full screen image
  if (report.audits?.['final-screenshot']?.details?.data)
    await fs.writeFile(join(routeReport.artifactPath, ReportArtifacts.screenshot), base64ToBuffer(report.audits['final-screenshot'].details.data))

  if (report.audits?.['full-page-screenshot']?.details?.screenshot?.data)
    await fs.writeFile(join(routeReport.artifactPath, ReportArtifacts.fullScreenScreenshot), base64ToBuffer(report.audits['full-page-screenshot'].details.screenshot.data))

  routeReport.report = normaliseLighthouseResult(report)
  logger.success(`Completed \`runLighthouseTask\` for \`${routeReport.route.path}\`. ${chalk.gray(`(Score: ${routeReport.report.score}${resolvedConfig.scanner.samples ? ` Samples: ${resolvedConfig.scanner.samples > 1}` : ''} ${worker.monitor().donePercStr}% complete)`)}`)
  return routeReport
}
