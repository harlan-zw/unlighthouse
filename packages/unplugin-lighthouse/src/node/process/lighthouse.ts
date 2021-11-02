import fs from 'fs'
import lighthouse from 'packages/unplugin-lighthouse/src/node/process/lighthouse'
import minimist from 'minimist'
import { RouteReport, Options } from '../../types';

(async() => {
  const { routeReport, port, options }: { options: string; routeReport: string; port: number } = minimist(process.argv.slice(2))

  const routeReportJson: RouteReport = JSON.parse(routeReport)
  const optionsJson: Options = JSON.parse(options)
  try {
    // @ts-ignore
    const runnerResult = await lighthouse(routeReportJson.fullRoute, {
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
