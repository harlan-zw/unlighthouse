import type { TaskFunction } from 'puppeteer-cluster/dist/Cluster'
import type {
  NormalisedRoute,
  PuppeteerTaskArgs,
  PuppeteerTaskReturn,
  UnlighthouseRouteReport,
  UnlighthouseTask,
  UnlighthouseWorker,
  UnlighthouseWorkerStats,
} from '../types'
import fs from 'node:fs'
import { join } from 'node:path'
import chalk from 'chalk'
import { get, sortBy, uniqBy } from 'lodash-es'
import { matchPathToRule } from '../discovery'
import { useLogger } from '../logger'
import { useUnlighthouse } from '../unlighthouse'
import { createTaskReportFromRoute, formatBytes, ReportArtifacts } from '../util'
import { createFilter, isImplicitOrExplicitHtml } from '../util/filter'
import {
  launchPuppeteerCluster,
} from './cluster'

let warnedMaxRoutesExceeded = false

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
  const retriedRoutes = new Map<string, number>()

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
    if (exceededMaxRoutes()) {
      if (!warnedMaxRoutesExceeded) {
        logger.warn(`You have reached the \`scanner.maxRoutes\` limit of ${resolvedConfig.scanner.maxRoutes}. No further routes will be queued, consider raising this limit.`)
        warnedMaxRoutesExceeded = true
        return
      }
      return
    }
    // no duplicate queueing, manually need to purge the reports to re-queue
    if (routeReports.has(id))
      return
    if (ignoredRoutes.has(id))
      return

    // do robots.txt test
    if (resolvedConfig.scanner.robotsTxt) {
      const rule = matchPathToRule(path, resolvedConfig.scanner._robotsTxtRules)
      if (rule && !rule.allow) {
        logger.info(`Skipping route based on robots.txt rule \`${rule.pattern}\``, { path })
        return
      }
    }

    if (resolvedConfig.scanner.include || resolvedConfig.scanner.exclude) {
      const filter = createFilter(resolvedConfig.scanner)
      if (!filter(path)) {
        logger.info('Skipping route based on include / exclude rules', {
          path,
          include: resolvedConfig.scanner.include,
          exclude: resolvedConfig.scanner.exclude,
        })
        return
      }
    }

    if (isImplicitOrExplicitHtml(path)) {
      logger.debug('Skipping non-HTML file from scanning', { path })
      return
    }

    /*
     * Allow sampling of named routes.
     *
     * Note: this is somewhat similar to the logic in discovery/routes.ts, that's because we need to sample the routes
     * from the sitemap or as provided. This logic is for ensuring crawled URLs don't exceed the group limit.
     */
    if (resolvedConfig.scanner.dynamicSampling && resolvedConfig.scanner.dynamicSampling > 0) {
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
          routeReport.tasksTime = routeReport.tasksTime || {}
          routeReport.tasksTime[taskName] = Date.now()
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
          if (response.tasks[taskName] === 'failed-retry') {
            const currentRetries = retriedRoutes.get(id) || 0
            // only requeue each report once
            if (currentRetries < 3) {
              retriedRoutes.set(id, currentRetries + 1)
              requeueReport(routeReport)
            }
            return
          }

          response.tasks[taskName] = 'completed'
          routeReports.set(id, response)
          hooks.callHook('task-complete', path, response, taskName)
          const ms = Date.now() - routeReport.tasksTime?.[taskName]
          // make ms human friendly
          const seconds = (ms / 1000).toFixed(1)
          const reportData = [
            `Time Taken: ${seconds}s`,
          ]
          if (taskName === 'runLighthouseTask') {
            if (response.report?.score)
              reportData.push(`Score: ${response.report.score}`)
            if (resolvedConfig.scanner.samples)
              reportData.push(`Samples: ${resolvedConfig.scanner.samples}`)
          }
          else if (taskName === 'inspectHtmlTask') {
            if (response.seo.htmlSize)
              reportData.push(formatBytes(response.seo.htmlSize))
          }
          reportData.push(`${monitor().donePercStr}% complete`)
          logger.success(`Completed \`${taskName}\` for \`${routeReport.route.path}\`. ${chalk.gray(`(${reportData.join(' ')})`)}`)
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

    // we're sort all routes by their route name if provided, otherwise use the path
    const sortedRoutes = sortBy(routes, (r) => {
      if (resolvedConfig.discovery && r.definition)
        return get(r, resolvedConfig.client.groupRoutesKey.replace('route.', ''))

      return r.path
    })
    sortedRoutes.forEach(route => queueRoute(route))
  }

  const requeueReport = (report: UnlighthouseRouteReport) => {
    logger.info(`Submitting \`${report.route.path}\` for a re-queue.`)
    // clean up artifacts
    Object.values(ReportArtifacts).forEach((artifact) => {
      fs.rmSync(join(report.artifactPath, artifact), { force: true, recursive: true })
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
