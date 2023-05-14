import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import minimist from 'minimist'
import { legacyNavigation  } from 'lighthouse'

/*
 * This file is intended to be run in its own process and should not rely on any global state.
 */

(async () => {
  const { routeReport, port, lighthouseOptions: lighthouseOptionsEncoded } = minimist(process.argv.slice(2))

  const routeReportJson = JSON.parse(routeReport)
  const lighthouseOptions = {
    ...JSON.parse(lighthouseOptionsEncoded),
    // always generate html / json reports
    output: ['html', 'json'],
    // we tell lighthouse the port
    port,
  }
  console.log(lighthouseOptions)
  try {
    const runnerResult = await legacyNavigation(routeReportJson.route.url, lighthouseOptions, {
      ...lighthouseOptions,
      disableFullPageScreenshot: true,
      disableStorageReset: true,
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 360,
        height: 640,
        deviceScaleFactor: 2,
      },
    })
    console.log(runnerResult)
    writeFileSync(join(routeReportJson.artifactPath, 'lighthouse.json'), runnerResult.report[1])
    writeFileSync(join(routeReportJson.artifactPath, 'lighthouse.html'), runnerResult.report[0])
    return true
  }
  catch (e) {
    console.error(e)
  }
  return false
})()
