import fs from 'fs'
import { join } from 'path'
import type { TaskFunction } from 'puppeteer-cluster/dist/Cluster'
import { get, sortBy, uniqBy } from 'lodash-es'
import type {
  NormalisedRoute,
  PuppeteerTaskArgs,
  PuppeteerTaskReturn,
  UnlighthouseRouteReport,
  UnlighthouseTask,
  UnlighthouseWorker, UnlighthouseWorkerStats,
} from '../types'
import {ReportArtifacts, createTaskReportFromRoute, asRegExp} from '../util'
import { useUnlighthouse } from '../unlighthouse'
import { useLogger } from '../logger'
import {
  launchPuppeteerCluster,
} from './cluster'

/**
 * The unlighthouse worker is a wrapper for the puppeteer-cluster. It handles the queuing of the tasks with more control
 * over the clusters monitoring and queue management while providing a tight integration with unlighthouse.
 *
 * @param tasks
 */
export async function createUnlighthouseWorker(tasks: Record<UnlighthouseTask, TaskFunction<PuppeteerTaskArgs, PuppeteerTaskReturn>>): Promise<UnlighthouseWorker> {
  const { hooks, resolvedConfig } = useUnlighthouse()
  const logger = useLogger()
  const cluster = await launchPuppeteerCluster()

  const routeReports = new Map<string, UnlighthouseRouteReport>()
  const ignoredRoutes = new Set<string>()

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

  const exceededMaxRoutes = () => {
    return resolvedConfig.scanner.maxRoutes !== false && routeReports.size >= resolvedConfig.scanner.maxRoutes
  }

  const queueRoute = (route: NormalisedRoute) => {
    const { id, path } = route

    // exceed the max routes
    if (exceededMaxRoutes())
      return
    // no duplicate queueing, manually need to purge the reports to re-queue
    if (routeReports.has(id))
      return
    if (ignoredRoutes.has(id))
      return

    if (resolvedConfig.scanner.include) {
      // must match
      if (resolvedConfig.scanner.include.filter(rule => asRegExp(rule).test(path)).length === 0)
        return
    }

    if (resolvedConfig.scanner.exclude) {
      // must not match
      if (resolvedConfig.scanner.exclude.filter(rule => asRegExp(rule).test(path)).length > 0)
        return
    }

    /*
     * Allow sampling of named routes.
     *
     * Note: this is somewhat similar to the logic in discovery/routes.ts, that's because we need to sample the routes
     * from the sitemap or as provided. This logic is for ensuring crawled URLs don't exceed the group limit.
     */
    if (resolvedConfig.scanner.dynamicSampling > 0) {
      const routeGroup = get(route, resolvedConfig.client.groupRoutesKey.replace('route.', ''))
      // group all urls by their route definition path name
      const routesInGroup = [...routeReports.values()].filter(
        r => get(r, resolvedConfig.client.groupRoutesKey) === routeGroup,
      ).length
      if (routesInGroup >= resolvedConfig.scanner.dynamicSampling) {
        // too verbose
        // logger.debug(`Route has been skipped \`${path}\`, too many routes in group \`${routeGroup}\` ${routesInGroup}/${resolvedConfig.scanner.dynamicSampling}.`)
        return
      }
    }

    const routeReport = createTaskReportFromRoute(route)
    logger.debug(`Route has been queued. Path: \`${path}\` Name: ${routeReport.route.definition?.name}.`)

    routeReports.set(id, routeReport)
    hooks.callHook('task-added', path, routeReport)

    const runTaskIndex = (idx = 0) => {
      // queue the html payload extraction before we perform the lighthouse scan
      const taskName = Object.keys(tasks)?.[idx] as UnlighthouseTask
      // handle invalid index
      if (!taskName) {
        // tasks are finished
        if (monitor().status === 'completed')
          hooks.callHook('worker-finished')

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
          // ignore this route
          if (response.tasks[taskName] === 'ignore') {
            routeReports.delete(id)
            ignoredRoutes.add(id)
            logger.debug(`Ignoring route \`${routeReport.route.path}\`.`)
            return
          }
          if (response.tasks[taskName] === 'failed')
            return

          response.tasks[taskName] = 'completed'
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
    // remove duplicates, less sorting
    routes = uniqBy(routes, 'path')

    const sortedRoutes = sortBy(routes,
      // we're sort all routes by their route name if provided, otherwise use the path
      (r) => {
        if (resolvedConfig.discovery && r.definition)
          return get(r, resolvedConfig.client.groupRoutesKey.replace('route.', ''))

        return r.path
      },
    )
    sortedRoutes.forEach(route => queueRoute(route))
  }

  const requeueReport = (report: UnlighthouseRouteReport) => {
    logger.info(`Submitting \`${report.route.path}\` for a re-queue.`)
    // clean up artifacts
    Object.values(ReportArtifacts).forEach((artifact) => {
      fs.rmSync(join(report.artifactPath, artifact), { force: true })
    })
    routeReports.delete(report.reportId)
    // arbitrary wait for HMR, lil dodgy
    setTimeout(() => {
      queueRoute(report.route)
    }, 3500)
  }

  const hasStarted = () => cluster.workers.length || cluster.workersStarting

  const reports = () => [...routeReports.values()]

  const invalidateFile = (file: string) => {
    // ignore anything in the output folder
    if (file.startsWith(resolvedConfig.outputPath))
      return false
    const matched = reports()
      .filter(r => r.route.definition.component === file || r.route.definition.component?.endsWith(file))

    if (matched.length) {
      logger.info(`Invalidating file ${file}, matched ${matched.length} routes.`)

      matched
        .forEach(r => requeueReport(r))
      return true
    }
    return false
  }

  const findReport = (id: string) => reports().filter(report => report.reportId === id)?.[0]

  return {
    cluster,
    routeReports,
    exceededMaxRoutes,
    requeueReport,
    invalidateFile,
    queueRoute,
    queueRoutes,
    findReport,
    monitor,
    hasStarted,
    reports,
  }
}
