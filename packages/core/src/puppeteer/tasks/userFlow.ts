// @ts-ignore
import { startFlow } from 'lighthouse/lighthouse-core/fraggle-rock/api.js'
import fs from 'fs-extra'
import { PuppeteerTask } from '../../types'

// @todo Implement. Currently this code does not work, presumably a conflict with puppeteer-cluster
export const userFlowTask: PuppeteerTask = async(props) => {
  const { page, data: routeReport } = props

  const newPage = await page.browser().newPage()
  // Get a session handle to be able to send protocol commands to the page.
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
