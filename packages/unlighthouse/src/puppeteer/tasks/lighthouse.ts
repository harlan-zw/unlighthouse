import { join } from 'path'
import fs from 'fs-extra'
import execa from 'execa'
import { LH } from 'lighthouse'
import {pick, sumBy} from 'lodash'
import {LighthouseReport, Options, PuppeteerTask} from '@shared'

export const normaliseLighthouseResult = (result: LH.Result, options: Options): LighthouseReport => {
  const measuredCategories = Object.values(result.categories)
    .filter(c => typeof c.score !== 'undefined') as { score: number }[]

  const columnFields = options.columns.flat()
      .filter(c => !!c.key)
      .map(c => c.key?.replace('report.', '')) as string[]
  // map the json report to what values we actually need
  return {
    ...pick(result, [
      'categories',
      'audits.final-screenshot',
      ...columnFields,
    ]),
    score: sumBy(measuredCategories, 'score') / measuredCategories.length,
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

  const jsonReport = fs.readJsonSync(routeReport.reportJson, { encoding: 'utf-8' }) as LH.Result
  routeReport.report = normaliseLighthouseResult(jsonReport, options)
  return routeReport
}
