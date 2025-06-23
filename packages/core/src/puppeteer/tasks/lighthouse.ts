import type { Result } from 'lighthouse'
import type { LighthouseReport, PuppeteerTask, UnlighthouseRouteReport } from '../../types'
import { join } from 'node:path'
import { execa } from 'execa'
import fs from 'fs-extra'
import { computeMedianRun } from 'lighthouse/core/lib/median-run.js'
import { map, pick, sumBy } from 'lodash-es'
import { relative } from 'pathe'
import { withQuery } from 'ufo'
import { useLogger } from '../../logger'
import { registerLighthouseProcess, setupProcessCleanup } from '../../process-registry'
import { useUnlighthouse } from '../../unlighthouse'
import { base64ToBuffer, ReportArtifacts } from '../../util'
import { isRetryableError, parseStructuredOutput } from '../../util/lighthouse-messages'
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
      'fetchTime',
      'audits.redirects',
      // core web vitals
      'audits.layout-shifts',
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
  const { resolvedConfig, runtimeSettings } = useUnlighthouse()
  const { page, data: routeReport } = props

  // Ensure process cleanup handlers are registered
  setupProcessCleanup()

  // if the report doesn't exist, we're going to run a new lighthouse process to generate it
  const reportJsonPath = join(routeReport.artifactPath, ReportArtifacts.reportJson)
  if (resolvedConfig.cache && fs.existsSync(reportJsonPath)) {
    try {
      const report = fs.readJsonSync(reportJsonPath, { encoding: 'utf-8' }) as Result
      routeReport.report = normaliseLighthouseResult(routeReport, report)
      return routeReport
    }
    catch (e) {
      logger.warn(`Failed to read cached lighthouse report for path "${routeReport.route.path}".`, e)
    }
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
      const worker = execa(
        'node',
        [runtimeSettings.lighthouseProcessPath, ...args],
        {
          timeout: 6 * 60 * 1000,
        },
      )

      // Register the process for cleanup
      registerLighthouseProcess(worker, routeReport.route.path, i)

      // Capture output instead of piping directly to console
      let stdout = ''
      let stderr = ''

      worker.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      worker.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      const res = await worker

      // Parse structured output
      const { messages, otherOutput } = parseStructuredOutput(stdout)

      // Log structured messages
      for (const message of messages) {
        switch (message.type) {
          case 'info':
            logger.info(`[Lighthouse] ${message.message}`)
            break
          case 'success':
            logger.info(`[Lighthouse] ${message.message}`)
            if (message.data?.score !== undefined) {
              logger.debug(`Performance score: ${Math.round(message.data.score * 100)}`)
            }
            break
          case 'error':
            logger.error(`[Lighthouse] ${message.message}`)
            if (message.error) {
              logger.error(`Error: ${message.error.name}: ${message.error.message}`)
              if (message.error.stack) {
                logger.debug(`Stack: ${message.error.stack}`)
              }
            }
            break
        }
      }

      // Log any non-structured output
      if (otherOutput.length > 0) {
        logger.debug('Lighthouse additional output:', otherOutput.join('\n'))
      }

      // Log stderr if present
      if (stderr.trim()) {
        logger.warn('Lighthouse stderr:', stderr.trim())
      }

      if (res.exitCode === 0) {
        const successMessages = messages.filter(m => m.type === 'success')
        if (successMessages.length > 0) {
          try {
            samples.push(fs.readJsonSync(reportJsonPath))
          }
          catch (readError) {
            logger.error(`Failed to read lighthouse report for route ${routeReport.route.path}: ${readError.message}`)
            logger.warn(`Lighthouse process succeeded but report file not found. This may indicate lighthouse failed to generate output.`)
          }
        }
        else {
          logger.warn(`Lighthouse process exited successfully but no success message received for ${routeReport.route.path}`)
        }
      }
      else {
        const errorMessages = messages.filter(m => m.type === 'error')
        if (errorMessages.length > 0) {
          const lastError = errorMessages[errorMessages.length - 1]
          throw new Error(`Lighthouse failed: ${lastError.error?.message || lastError.message}`)
        }
        else {
          throw new Error(`Lighthouse process failed with exit code ${res.exitCode}`)
        }
      }
    }
    catch (e) {
      logger.error(`Failed to run lighthouse for route ${routeReport.route.path}:`, e)

      // Determine if this is a retryable error
      const isRetryable = e.message ? isRetryableError(e.message) : false

      if (isRetryable) {
        logger.warn(`Retryable error detected for ${routeReport.route.path}, marking for retry`)
        routeReport.tasks.runLighthouseTask = 'failed-retry'
      }
      else {
        logger.error(`Non-retryable error for ${routeReport.route.path}, marking as failed`)
        routeReport.tasks.runLighthouseTask = 'failed'
      }

      return routeReport
    }
  }

  let report: Result = samples[0]

  if (!report) {
    logger.error(`Task \`runLighthouseTask\` has failed to run for path "${routeReport.route.path}". No lighthouse reports were generated successfully.`)
    logger.warn(`This could be due to lighthouse timing out, network issues, or the target page being unreachable. Check that the URL is accessible and try again.`)
    routeReport.tasks.runLighthouseTask = 'failed'
    return routeReport
  }

  if (report.categories.performance && !report.categories.performance.score) {
    logger.warn(`Lighthouse failed to run performance audits for "${routeReport.route.path}", adding back to queue${report.runtimeError ? `: ${report.runtimeError.message}` : '.'}`)
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
  return routeReport
}
