import {
  NormalisedRoute,
  UnlighthouseRouteReport,
  UnlighthouseWorker,
  PuppeteerTaskArgs,
  PuppeteerTaskReturn,
  UnlighthouseWorkerStats,
} from '@shared'
import { TaskFunction } from 'puppeteer-cluster/dist/Cluster'
import { filter, sortBy } from 'lodash'
import get from 'lodash/get'
import { createTaskReportFromRoute } from '../core/util'
import { useUnlighthouseEngine } from '../core/engine'
import { useLogger } from '../core/logger'
import {
  launchCluster,
} from './cluster'


export async function createUnlighthouseWorker(tasks: Record<string, TaskFunction<PuppeteerTaskArgs, PuppeteerTaskReturn>>): Promise<UnlighthouseWorker> {
  const { hooks, runtimeSettings, resolvedConfig } = useUnlighthouseEngine()
  const logger = useLogger()
  const cluster = await launchCluster()

  const routeReports = new Map<string, UnlighthouseRouteReport>()

  const queueRoute = (route: NormalisedRoute) => {
    const { id, path } = route

    // no duplicate queueing, manually need to purge the reports to re-queue
    if (routeReports.has(id))
      return

    /*
     * Allow sampling of named routes.
     *
     * Note: this is somewhat similar to the logic in discovery/routes.ts, that's because we need to sample the routes
     * from the sitemap or as provided. This logic is for ensuring crawled URLs don't exceed the group limit.
     */
    if (resolvedConfig.scanner.dynamicSampling > 0) {
      const routeGroup = get(route, resolvedConfig.client.groupRoutesKey.replace('route.', ''))
      // group all urls by their route definition path name
      const routesInGroup = filter(
          [...routeReports.values()],
          r => get(r, resolvedConfig.client.groupRoutesKey) === routeGroup,
      ).length
      if (routesInGroup >= resolvedConfig.scanner.dynamicSampling) {
        logger.debug(`Route has been skipped \`${path}\`, too many routes in group \`${routeGroup}\` ${routesInGroup}/${resolvedConfig.scanner.dynamicSampling}.`)
        return
      }
    }

    const routeReport = createTaskReportFromRoute(route)
    logger.debug(`Route has been queued \`${path}\`.`)

    routeReports.set(id, routeReport)
    hooks.callHook('task-added', path, routeReport)

    const runTaskIndex = (idx: number = 0) => {
      // queue the html payload extraction before we perform the lighthouse scan
      const taskName = Object.keys(tasks)?.[idx]
      // handle invalid index
      if (!taskName) {
        return
      }
      const task = Object.values(tasks)[idx]
      routeReport.tasks[taskName] = 'waiting'
      cluster
          .execute(routeReport, (arg) => {
            routeReport.tasks[taskName] = 'in-progress'
            hooks.callHook('task-started', path, routeReport)
            return task(arg)
          })
          .then((response) => {
            if (response.tasks[taskName] === 'failed') {
              return
            }
            response.tasks[taskName] = 'completed'
            logger.debug(`Completed task \`${taskName}\` for \`${path}\`.`)
            routeReports.set(id, response)
            hooks.callHook('task-complete', path, response, taskName)
            // run the next task
            runTaskIndex(idx + 1)
          })
    }

    // run the tasks sequentially
    runTaskIndex()
  }

  const queueRoutes = (routes: NormalisedRoute[]) => {
    const sortedRoutes = sortBy(routes,
        // we're sort all routes by their route name if provided, otherwise use the path
        runtimeSettings.hasRouteDefinitions ? 'definition.name' : 'path',
    )
    sortedRoutes.forEach(route => queueRoute(route))
  }

  const hasStarted = () => cluster.workers.length || cluster.workersStarting

  const reports = () => [...routeReports.values()]

  const monitor: () => UnlighthouseWorkerStats = () => {
    const now = Date.now()
    const timeDiff = now - cluster.startTime
    const doneTargets = cluster.allTargetCount - cluster.jobQueue.size() - cluster.workersBusy.length
    const donePercentage = cluster.allTargetCount === 0 ? 1 : (doneTargets / cluster.allTargetCount)
    const donePercStr = (100 * donePercentage).toFixed(0)
    const errorPerc = doneTargets === 0
        ? '0.00'
        : (100 * cluster.errorCount / doneTargets).toFixed(2)
    const timeRunning = timeDiff
    let timeRemainingMillis = -1
    if (donePercentage !== 0)
      timeRemainingMillis = Math.round(((timeDiff) / donePercentage) - timeDiff)

    const timeRemaining = timeRemainingMillis
    const cpuUsage = `${cluster.systemMonitor.getCpuUsage().toFixed(1)}%`
    const memoryUsage = `${cluster.systemMonitor.getMemoryUsage().toFixed(1)}%`
    const pagesPerSecond = doneTargets === 0
        ? '0'
        : (doneTargets * 1000 / timeDiff).toFixed(2)
    return {
      status: cluster.allTargetCount === doneTargets ? 'completed' : 'working',
      timeRunning,
      doneTargets,
      allTargets: cluster.allTargetCount,
      donePercStr,
      errorPerc,
      timeRemaining,
      pagesPerSecond,
      cpuUsage,
      memoryUsage,
      workers: cluster.workers.length + cluster.workersStarting,
    }
  }

  const findReport = (id :string ) => reports().filter(report => report.reportId === id)?.[0]

  return {
    cluster,
    routeReports,
    queueRoute,
    queueRoutes,
    findReport,
    monitor,
    hasStarted,
    reports,
  }
}
