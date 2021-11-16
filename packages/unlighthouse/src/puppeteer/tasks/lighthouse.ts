import { join } from 'path'
import fs from 'fs-extra'
import execa from 'execa'
import { LH } from 'lighthouse'
import { pick } from 'lodash'
import { LighthouseReport, PuppeteerTask } from '@shared'

export const normaliseLighthouseResult = (result: LH.Result): LighthouseReport => {
  const measuredCategories = Object.values(result.categories)
    .filter(c => !!c.score) as { score: number }[]
  // map the json report to what values we actually need
  return {
    ...pick(result, [
      'categories',
      // overview
      'audits.final-screenshot',
      // performance
      'audits.first-contentful-paint',
      'audits.total-blocking-time',
      'audits.cumulative-layout-shift',
      'audits.diagnostics',
      'audits.network-requests',
      // accessibility
      'audits.color-contrast',
      'audits.image-alt',
      'audits.link-name',
      // best practices
      'audits.errors-in-console',
      'audits.no-vulnerable-libraries',
      'audits.external-anchors-use-rel-noopener',
      'audits.image-aspect-ratio',
      // seo
      'audits.is-crawlable',
    ]),
    score: measuredCategories
      .map(c => c.score)
      .reduce((s, a) => s + a, 0) / measuredCategories.length,
  }
}

export const runLighthouseTask: PuppeteerTask = async(props) => {
  const { page, data } = props
  const { routeReport, options } = data

  // if the report doesn't exist we're going to run a new lighthouse process to generate it
  // @todo figure out better caching
  if (!fs.existsSync(routeReport.reportJson)) {
    const browser = page.browser()
    const port = new URL(browser.wsEndpoint()).port

    const args = [
      `--routeReport=${JSON.stringify(pick(routeReport, ['route.url', 'reportJson', 'reportHtml']))}`,
      `--options=${JSON.stringify(options)}`,
      `--port=${port}`,
    ]

    // Spawn a worker process
    const worker = execa('jiti', [join(__dirname, '..', '..', '..', 'process', 'lighthouse.ts'), ...args], {
      timeout: 6 * 60 * 1000,
    })
    worker.stdout!.pipe(process.stdout)
    worker.stderr!.pipe(process.stderr)
    const response = await worker

    if (response.failed)
      return false
  }
  routeReport.resolved = true

  const jsonReport = fs.readJsonSync(routeReport.reportJson, { encoding: 'utf-8' }) as LH.Result
  routeReport.report = normaliseLighthouseResult(jsonReport)
  return routeReport
}
