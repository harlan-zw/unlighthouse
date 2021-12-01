import { startFlow } from 'lighthouse/lighthouse-core/fraggle-rock/api.js'
import { PuppeteerTask } from 'unlighthouse-utils'
import fs from 'fs-extra'

// @todo implement
export const userFlowTask: PuppeteerTask = async(props) => {
  const { page, data: routeReport } = props

  const newPage = await page.browser().newPage()
  // Get a session handle to be able to send protocol commands to the page.
  console.log('flow url', routeReport.route.url)
  const flow = await startFlow(newPage, { name: 'Cold and warm navigations' })
  await flow.navigate(routeReport.route.url, {
    stepName: 'Cold navigation',
  })
  await flow.navigate(routeReport.route.url, {
    stepName: 'Warm navigation',
    configContext: {
      settingsOverrides: { disableStorageReset: true },
    },
  })

  await page.browser().close()

  const report = flow.generateReport()

  fs.writeFileSync(routeReport.htmlPayload.replace('lighthouse.html', 'flow.report.html'), report)

  return routeReport
}
