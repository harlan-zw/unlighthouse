import type { Flags } from 'lighthouse'
import type { UnlighthouseRouteReport } from '../types'
import type { LighthouseProcessMessage } from '../util/lighthouse-messages'
import { setMaxListeners } from 'node:events'
import fs from 'node:fs'
import { join } from 'node:path'
import lighthouse from 'lighthouse'
import minimist from 'minimist'

setMaxListeners(0)

/*
 * This file is intended to be run in its own process and should not rely on any global state.
 */

function sendMessage(message: LighthouseProcessMessage) {
  // eslint-disable-next-line no-console
  console.log(`__LIGHTHOUSE_MESSAGE__${JSON.stringify(message)}__END_MESSAGE__`)
}

(async () => {
  const { routeReport, port, lighthouseOptions: lighthouseOptionsEncoded }
      = minimist<{ options: string, cache: boolean, routeReport: string, port: number }>(process.argv.slice(2))

  let routeReportJson: UnlighthouseRouteReport
  try {
    routeReportJson = JSON.parse(routeReport)
  }
  catch (e: unknown) {
    sendMessage({
      type: 'error',
      route: 'unknown',
      message: 'Failed to parse Unlighthouse config',
      error: {
        name: 'ConfigParseError',
        message: e instanceof Error ? e.message : String(e),
        stack: e instanceof Error ? e.stack : undefined,
      },
      data: { args: process.argv.slice(2) },
    })
    process.exit(1)
  }

  const route = routeReportJson.route.url
  sendMessage({
    type: 'info',
    route,
    message: 'Starting lighthouse audit',
  })

  const lighthouseOptions: Flags = {
    ...JSON.parse(lighthouseOptionsEncoded),
    output: ['html', 'json'],
    port,
  }

  try {
    const runnerResult = await lighthouse(route, lighthouseOptions)

    if (!runnerResult || !runnerResult.report) {
      sendMessage({
        type: 'error',
        route,
        message: 'Lighthouse returned invalid result',
        error: {
          name: 'InvalidLighthouseResult',
          message: 'Lighthouse audit completed but returned no report data',
        },
      })
      process.exit(1)
    }

    // Write files
    const jsonPath = join(routeReportJson.artifactPath, 'lighthouse.json')
    const htmlPath = join(routeReportJson.artifactPath, 'lighthouse.html')

    fs.writeFileSync(jsonPath, runnerResult.report[1])
    fs.writeFileSync(htmlPath, runnerResult.report[0])

    sendMessage({
      type: 'success',
      route,
      message: 'Lighthouse audit completed successfully',
      data: {
        jsonPath,
        htmlPath,
        score: runnerResult.lhr?.categories?.performance?.score,
      },
    })

    process.exit(0)
  }
  catch (e) {
    const error = e as Error
    sendMessage({
      type: 'error',
      route,
      message: 'Lighthouse audit failed',
      error: {
        name: error.name || 'LighthouseError',
        message: error.message,
        stack: error.stack,
        code: (error as any).code,
      },
    })
    process.exit(1)
  }
})()
