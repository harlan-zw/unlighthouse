import { createHooks } from 'hookable'
import {
  NormalisedRoute,
  Options,
  UnlighthouseRouteReport,
  WorkerHooks,
  UnlighthouseWorker,
  PuppeteerTaskArgs,
  PuppeteerTaskReturn, UnlighthouseWorkerStats,
} from '@shared'
import { TaskFunction } from 'puppeteer-cluster/dist/Cluster'
import { normaliseRouteForTask, useLogger } from '../core'
import {
  launchCluster,
} from './cluster'
import {sortBy} from "lodash";

export async function createUnlighthouseWorker(tasks: Record<string, TaskFunction<PuppeteerTaskArgs, PuppeteerTaskReturn>>, options: Options): Promise<UnlighthouseWorker> {
  const hooks = createHooks<WorkerHooks>()
  const logger = useLogger()
  const cluster = await launchCluster(options)

  const routeReports = new Map<string, UnlighthouseRouteReport>()

  const queueRoute = (route: NormalisedRoute) => {
    const { id, path } = route

    if (routeReports.has(id)) {
      logger.debug(`${path} has already been processed, skipping.`)
      return
    }

    const routeReport = normaliseRouteForTask(route, options)
    logger.debug(`${path} has been queued.`)

    routeReports.set(id, routeReport)
    hooks.callHook('task-added', path, routeReport)

    const taskOptions = {
      routeReport,
      options,
    }

    Object.values(tasks)
        .forEach((task, key) => {
          const taskName = Object.keys(tasks)[key]
          routeReport.tasks[taskName] = 'waiting'
          cluster
              .execute(taskOptions, (arg) => {
                routeReport.tasks[taskName] = 'in-progress'
                hooks.callHook('task-started', path, routeReport)
                return task(arg)
              })
              .then((response) => {
                if (!response)
                  return
                response.tasks[taskName] = 'completed'
                logger.info(`${path} has finished processing task ${taskName}.`)
                routeReports.set(id, response)
                hooks.callHook('task-complete', path, response, taskName)
              })
        })
  }

  const queueRoutes = (routes: NormalisedRoute[]) => {
    const sortedRoutes = sortBy(routes, 'definition.name')
    sortedRoutes.forEach(route => queueRoute(route))
  }

  const hasStarted = () => {
    return routeReports.size > 0
  }

  const reports = () => {
    const r: UnlighthouseRouteReport[] = []
    routeReports.forEach((val) => {
      r.push(val)
    })
    return r
  }

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

  return {
    hooks,
    cluster,
    routeReports,
    processRoute: queueRoute,
    processRoutes: queueRoutes,
    monitor,
    hasStarted,
    reports,
  }
}
