import fs from 'fs'
import lighthouse from 'lighthouse'
import minimist from 'minimist'
import { UnlighthouseRouteReport, Options } from '@shared';

(async() => {
  const { routeReport, port, options }: { options: string; routeReport: string; port: number } = minimist(process.argv.slice(2))

  const routeReportJson: UnlighthouseRouteReport = JSON.parse(routeReport)
  const optionsJson: Options = JSON.parse(options)
  try {
    // @ts-ignore
    const runnerResult = await lighthouse(routeReportJson.route.url, {
      ...optionsJson.lighthouse,
      output: ['html', 'json'],
      port,
    })

    fs.writeFileSync(routeReportJson.reportJson, runnerResult.report[1])
    fs.writeFileSync(routeReportJson.reportHtml, runnerResult.report[0])
    return runnerResult
  }
  catch (e) {
    console.error(e)
  }
})()
