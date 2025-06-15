import type { Flags } from 'lighthouse'
import type { UnlighthouseRouteReport } from './types'
import { setMaxListeners } from 'node:events'
import fs from 'node:fs'
import { join } from 'node:path'
import lighthouse from 'lighthouse'
import minimist from 'minimist'

setMaxListeners(0);

/*
 * This file is intended to be run in its own process and should not rely on any global state.
 */

(async () => {
  const { routeReport, port, lighthouseOptions: lighthouseOptionsEncoded }
      = minimist<{ options: string, cache: boolean, routeReport: string, port: number }>(process.argv.slice(2))

  let routeReportJson: UnlighthouseRouteReport
  try {
    routeReportJson = JSON.parse(routeReport)
  }
  catch (e: unknown) {
    console.error('Failed to parse Unlighthouse config. Please create an issue with this output.', process.argv.slice(2), e)
    return false
  }
  const lighthouseOptions: Flags = {
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
