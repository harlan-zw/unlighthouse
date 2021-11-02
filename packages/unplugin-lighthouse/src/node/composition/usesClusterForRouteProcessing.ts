import { RouteDefinition } from 'nuxt-kit-extras/types'
import { init as initCluster, runLighthouseWorker, scrapeSeoMeta } from '../puppeteerCluster'
import { Options, RouteReport } from '../../types'
import { generateRouteReportInput } from '../../core'

export async function usesClusterForRouteProcessing(options: Options) {
  const cluster = await initCluster(options)

  const jobMap = new Map()

  const processRoute = (route: RouteDefinition) => {
    // don't run on named routes
    if (route.path.includes(':') || jobMap.has(route.path)) {
      // add to the map so we can display the routes as pending
      return
    }

    const routeReport = generateRouteReportInput(route, options)
    jobMap.set(route.path, routeReport)

    const taskOptions = {
      routeReport,
      options,
    }

    const jobs = [
      scrapeSeoMeta,
      runLighthouseWorker,
    ]

    jobs
      .forEach(job => cluster.execute(taskOptions, job)
        .then((response) => {
          if (!response)
            return

          jobMap.set(route.path, response)
        }),
      )
  }

  const processRoutes = (routes: RouteDefinition[]) => {
    routes.forEach(route => processRoute(route))
  }

  const runningTasks = () => {
    return Array.from(jobMap.values()).filter(report => !report.resolved).length
  }

  const hasStarted = () => {
    return jobMap.size > 0
  }

  const reports = () => {
    const r: RouteReport[] = []
    jobMap.forEach((val) => {
      r.push(val)
    })
    return r
  }

  return {
    cluster,
    processRoute,
    processRoutes,
    runningTasks,
    hasStarted,
    reports,
  }
}
