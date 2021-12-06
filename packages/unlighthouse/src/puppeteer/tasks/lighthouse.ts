import { join } from 'path'
import fs, { readJsonSync } from 'fs-extra'
import type { LH } from 'lighthouse'
import pick from 'lodash/pick'
import sumBy from 'lodash/sumBy'
import type { LighthouseReport, PuppeteerTask } from 'unlighthouse-utils'
import sum from 'lodash/sum'
// @ts-ignore
import { computeMedianRun } from 'lighthouse/lighthouse-core/lib/median-run'
import { useUnlighthouse } from '../../core/unlighthouse'
import { useLogger } from '../../core/logger'

export const normaliseLighthouseResult = (result: LH.Result): LighthouseReport => {
  const { resolvedConfig } = useUnlighthouse()

  const measuredCategories = Object.values(result.categories)
    .filter(c => typeof c.score !== 'undefined') as { score: number }[]

  const columnFields = Object.values(resolvedConfig.client.columns)
    .flat()
    .filter(c => !!c.key)
    .map(c => c.key?.replace('report.', '')) as string[]

  const imageIssues = sum([
    result.audits['unsized-images']?.details?.items?.length || 0,
    result.audits['preload-lcp-image']?.details?.items?.length || 0,
    result.audits['offscreen-images']?.details?.items?.length || 0,
    result.audits['modern-image-formats']?.details?.items?.length || 0,
    result.audits['uses-optimized-images']?.details?.items?.length || 0,
    result.audits['efficient-animated-content']?.details?.items?.length || 0,
    result.audits['uses-responsive-images']?.details?.items?.length || 0,
  ])
  // map the json report to what values we actually need
  return {
    ...pick(result, [
      'categories',
      'audits.redirects',
      'audits.final-screenshot',
      ...columnFields,
    ]),
    computed: {
      imageIssues: {
        displayValue: imageIssues,
        score: imageIssues > 0 ? 0 : 1,
      },
    },
    score: sumBy(measuredCategories, 'score') / measuredCategories.length,
  }
}

export const runLighthouseTask: PuppeteerTask = async(props) => {
  const logger = useLogger()
  const { resolvedConfig, runtimeSettings } = useUnlighthouse()
  const { page, data: routeReport } = props

  // if the report doesn't exist we're going to run a new lighthouse process to generate it
  if (fs.existsSync(routeReport.reportJson)) {
    const report = fs.readJsonSync(routeReport.reportJson, { encoding: 'utf-8' }) as LH.Result
    routeReport.report = normaliseLighthouseResult(report)
    logger.debug(`Completed \`runLighthouseTask\` for \`${routeReport.route.path}\` using cache. (Score \`${routeReport.report.score}\`)`)
    return routeReport
  }

  const lighthouseProcessPath = require.resolve(join(runtimeSettings.moduleWorkingDir, '..', 'process', 'lighthouse.ts'))

  const browser = page.browser()
  const port = new URL(browser.wsEndpoint()).port

  const args = [
    `--routeReport=${JSON.stringify(pick(routeReport, ['route.url', 'reportJson', 'reportHtml']))}`,
    `--lighthouseOptions=${JSON.stringify(resolvedConfig.lighthouseOptions)}`,
    `--port=${port}`,
  ]

  const samples = []
  for (let i = 0; i < resolvedConfig.scanner.samples; i++) {
    try {
      // Spawn a worker process
      const worker = (await import('execa'))
        .execa('jiti', [lighthouseProcessPath, ...args], {
          timeout: 6 * 60 * 1000,
        })
      worker.stdout!.pipe(process.stdout)
      worker.stderr!.pipe(process.stderr)
      const res = await worker
      if (res)
        samples.push(readJsonSync(routeReport.reportJson))
    }
    catch (e) {
      logger.error('Failed to run lighthouse for route', e)
    }
  }

  const report = samples.length === 1 ? samples[0] : computeMedianRun(samples)

  if (!report) {
    logger.error(`Task \`runLighthouseTask\` has failed to run for path "${routeReport.route.path}".`)
    routeReport.tasks.runLighthouseTask = 'failed'
  }
  routeReport.report = normaliseLighthouseResult(report)
  return routeReport
}
