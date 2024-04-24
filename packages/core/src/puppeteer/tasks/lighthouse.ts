import { join } from 'node:path'
import fs from 'fs-extra'
import type { Result } from 'lighthouse'
import { map, pick, sumBy } from 'lodash-es'
import { computeMedianRun } from 'lighthouse/core/lib/median-run.js'
import chalk from 'chalk'
import { relative } from 'pathe'
import { withQuery } from 'ufo'
import type { LighthouseReport, PuppeteerTask, UnlighthouseRouteReport } from '../../types'
import { useUnlighthouse } from '../../unlighthouse'
import { useLogger } from '../../logger'
import { ReportArtifacts, base64ToBuffer } from '../../util'
import { setupPage } from '../util'

export function normaliseLighthouseResult(route: UnlighthouseRouteReport, result: Result): LighthouseReport {
  const { resolvedConfig, runtimeSettings } = useUnlighthouse()

  const measuredCategories = Object.values(result.categories)
    .filter(c => typeof c.score !== 'undefined') as { score: number }[]

  const columnFields = Object.values(resolvedConfig.client.columns)
    .flat()
    .filter(c => !!c.key)
    .map(c => c.key?.replace('report.', '')) as string[]

  const imageIssues = [
    result.audits['unsized-images'],
    result.audits['preload-lcp-image'],
    result.audits['offscreen-images'],
    result.audits['modern-image-formats'],
    result.audits['uses-optimized-images'],
    result.audits['efficient-animated-content'],
    result.audits['uses-responsive-images'],
  ]
    .map(d => (d?.details as any)?.items || [])
    .flat()
  const ariaIssues = Object.values(result.audits)
    // @ts-expect-error untyped
    .filter(a => a && a.id.startsWith('aria-') && a.details?.items?.length > 0)
    // @ts-expect-error untyped
    .map(a => a.details?.items)
    .flat()
  // @ts-expect-error untyped
  if (result.audits['screenshot-thumbnails']?.details?.items) {
    // need to convert the base64 screenshot-thumbnails into their file name
    // @ts-expect-error untyped
    for (const k in result.audits['screenshot-thumbnails'].details.items)
      // @ts-expect-error untyped
      result.audits['screenshot-thumbnails'].details.items[k].data = relative(runtimeSettings.generatedClientPath, join(route.artifactPath, ReportArtifacts.screenshotThumbnailsDir, `${k}.jpeg`))
  }
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
  const { resolvedConfig, runtimeSettings, worker } = useUnlighthouse()
  const { page, data: routeReport } = props

  // if the report doesn't exist, we're going to run a new lighthouse process to generate it
  const reportJsonPath = join(routeReport.artifactPath, ReportArtifacts.reportJson)
  if (resolvedConfig.cache && fs.existsSync(reportJsonPath)) {
    const report = fs.readJsonSync(reportJsonPath, { encoding: 'utf-8' }) as Result
    routeReport.report = normaliseLighthouseResult(routeReport, report)
    return routeReport
  }

  await setupPage(page)

  const port = new URL(page.browser().wsEndpoint()).port
  // allow changing behavior of the page
  const clonedRouteReport = { ...routeReport }
  // just modify the url for the unlighthouse request
  if (resolvedConfig.defaultQueryParams)
    clonedRouteReport.route.url = withQuery(clonedRouteReport.route.url, resolvedConfig.defaultQueryParams)

  const args = [
    `--cache=${JSON.stringify(resolvedConfig.cache)}`,
    `--routeReport=${JSON.stringify(pick(clonedRouteReport, ['route.url', 'artifactPath']))}`,
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

  let report: Result = samples[0]

  if (!report) {
    logger.error(`Task \`runLighthouseTask\` has failed to run for path "${routeReport.route.path}".`)
    routeReport.tasks.runLighthouseTask = 'failed'
    return routeReport
  }

  if (report.categories.performance && !report.categories.performance.score) {
    logger.warn(`Lighthouse failed to run performance audits for "${routeReport.route.path}", adding back to queue.`)
    routeReport.tasks.runLighthouseTask = 'failed-retry'
    return routeReport
  }

  if (samples.length > 1) {
    try {
      report = computeMedianRun(samples)
    }
    catch (e) {
      logger.warn('Error when computing median score, possibly audit failed.', e)
    }
  }

  // we need to export all base64 data to improve the stability of the client
  // @ts-expect-error untyped
  if (report.audits?.['final-screenshot']?.details?.data)
    // @ts-expect-error untyped
    await fs.writeFile(join(routeReport.artifactPath, ReportArtifacts.screenshot), base64ToBuffer(report.audits['final-screenshot'].details.data))

  if (report.fullPageScreenshot?.screenshot.data)
    await fs.writeFile(join(routeReport.artifactPath, ReportArtifacts.fullScreenScreenshot), base64ToBuffer(report.fullPageScreenshot.screenshot.data))

  // extract the screenshot-thumbnails into separate files
  const screenshotThumbnails = report.audits?.['screenshot-thumbnails']?.details
  await fs.mkdir(join(routeReport.artifactPath, ReportArtifacts.screenshotThumbnailsDir), { recursive: true })
  // @ts-expect-error untyped
  if (screenshotThumbnails?.items && screenshotThumbnails.type === 'filmstrip') {
    for (const key in screenshotThumbnails.items) {
      const thumbnail = screenshotThumbnails.items[key]
      await fs.writeFile(join(routeReport.artifactPath, ReportArtifacts.screenshotThumbnailsDir, `${key}.jpeg`), base64ToBuffer(thumbnail.data))
    }
  }

  routeReport.report = normaliseLighthouseResult(routeReport, report)
  logger.success(`Completed \`runLighthouseTask\` for \`${routeReport.route.path}\`. ${chalk.gray(`(Score: ${routeReport.report.score}${resolvedConfig.scanner.samples > 0 ? ` Samples: ${resolvedConfig.scanner.samples}` : ''} ${worker.monitor().donePercStr}% complete)`)}`)
  return routeReport
}
