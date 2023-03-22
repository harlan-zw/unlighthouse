import fs from 'fs'
import { join } from 'path'
import lighthouse from 'lighthouse'
import minimist from 'minimist'
import type { UnlighthouseRouteReport } from '../types'

/*
 * This file is intended to be run in its own process and should not rely on any global state.
 */

(async () => {
  const { routeReport, port, lighthouseOptions: lighthouseOptionsEncoded }
      = minimist<{ options: string; cache: boolean; routeReport: string; port: number }>(process.argv.slice(2))

  const routeReportJson: UnlighthouseRouteReport = JSON.parse(routeReport)
  const lighthouseOptions: LH.Flags = {
    ...JSON.parse(lighthouseOptionsEncoded),
    // always generate html / json reports
    output: ['html', 'json'],
    // we tell lighthouse the port
    port,
  }
  try {
    const runnerResult = await lighthouse(routeReportJson.route.url, lighthouseOptions)
    fs.writeFileSync(join(routeReportJson.artifactPath, 'lighthouse.json'), runnerResult.report[1])
    fs.writeFileSync(join(routeReportJson.artifactPath, 'lighthouse.html'), runnerResult.report[0])
    return true
  }
  catch (e) {
    console.error(e)
  }
  return false
})()
