import type {
  NormalisedRoute,
  PuppeteerTaskArgs,
  PuppeteerTaskReturn,
  UnlighthouseRouteReport,
  UnlighthouseTask,
  UnlighthouseWorker,
  UnlighthouseWorkerStats,
} from '../types'
import type { TaskFunction } from '../types/puppeteer'
import type { ProgressData } from '../util/progressBox'
import fs from 'node:fs'
import { join } from 'node:path'
import { get, sortBy, uniqBy } from 'lodash-es'
import { matchPathToRule } from '../discovery'
import { useLogger } from '../logger'
import { useUnlighthouse } from '../unlighthouse'
import { createTaskReportFromRoute, formatBytes, ReportArtifacts } from '../util'
import { createFilter, isImplicitOrExplicitHtml } from '../util/filter'
import { createProgressBox } from '../util/progressBox'
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
  const progressBox = createProgressBox()
  const cluster = await launchPuppeteerCluster()

  const routeReports = new Map<string, UnlighthouseRouteReport>()
  const ignoredRoutes = new Set<string>()
  const retriedRoutes = new Map<string, number>()

  // Track actual task completion times for better time estimation
  const taskCompletionTimes = new Map<string, Record<UnlighthouseTask, number>>()

  // Track progress for live display
  const startTime = Date.now()
  let currentTaskInfo = ''

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

    // Calculate weighted time remaining based on task types and their historical durations
    let timeRemainingMillis = -1
    if (donePercentage !== 0) {
      // Collect historical task times to calculate averages
      const taskDurations: Record<UnlighthouseTask, number[]> = {
        inspectHtmlTask: [],
        runLighthouseTask: [],
      }

      // Gather actual completed task times
      for (const [, completionTimes] of taskCompletionTimes) {
        for (const taskName of Object.keys(tasks) as UnlighthouseTask[]) {
          const duration = completionTimes[taskName]
          if (duration) {
            taskDurations[taskName].push(duration)
          }
        }
      }

      // Calculate average durations or use defaults
      const avgInspectTime = taskDurations.inspectHtmlTask.length > 0
        ? taskDurations.inspectHtmlTask.reduce((a, b) => a + b, 0) / taskDurations.inspectHtmlTask.length
        : 2000 // 2 seconds default
      const avgLighthouseTime = taskDurations.runLighthouseTask.length > 0
        ? taskDurations.runLighthouseTask.reduce((a, b) => a + b, 0) / taskDurations.runLighthouseTask.length
        : 15000 // 15 seconds default

      // Count remaining tasks by type
      let remainingInspectTasks = 0
      let remainingLighthouseTasks = 0

      for (const report of routeReports.values()) {
        for (const taskName of Object.keys(tasks) as UnlighthouseTask[]) {
          const taskStatus = report.tasks[taskName]
          if (taskStatus === 'waiting' || taskStatus === 'in-progress') {
            if (taskName === 'inspectHtmlTask') {
              remainingInspectTasks++
            }
            else if (taskName === 'runLighthouseTask') {
              remainingLighthouseTasks++
            }
          }
        }
      }

      // Calculate weighted time remaining
      const estimatedRemainingTime = (remainingInspectTasks * avgInspectTime) + (remainingLighthouseTasks * avgLighthouseTime)
      timeRemainingMillis = Math.round(estimatedRemainingTime)

      // Fallback to original calculation if we don't have enough data
      if (remainingInspectTasks === 0 && remainingLighthouseTasks === 0) {
        timeRemainingMillis = Math.round(((timeDiff) / donePercentage) - timeDiff)
      }
    }

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

  const updateProgressDisplay = () => {
    if (!process.stdin.isTTY)
      return // Don't show progress in non-TTY environments

    const stats = monitor()
    const completedReports = routeReports.size > 0
      ? [...routeReports.values()].filter(r =>
          Object.values(r.tasks).every(status => status === 'completed' || status === 'ignore' || status === 'failed'),
        )
      : []

    // Calculate average score from completed reports
    const scoresFromReports = completedReports
      .map(r => r.report?.score)
      .filter((score): score is number => typeof score === 'number')

    const averageScore = scoresFromReports.length > 0
      ? scoresFromReports.reduce((sum, score) => sum + score, 0) / scoresFromReports.length
      : undefined

    const progressData: ProgressData = {
      currentTask: currentTaskInfo,
      completedTasks: stats.doneTargets,
      totalTasks: stats.allTargets,
      averageScore,
      timeElapsed: Date.now() - startTime,
      timeRemaining: stats.timeRemaining > 0 ? stats.timeRemaining : undefined,
    }

    progressBox.update(progressData)
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
    if (resolvedConfig.scanner.robotsTxt && resolvedConfig.scanner._robotsTxtRules?.length) {
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

    if (!isImplicitOrExplicitHtml(path)) {
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

    // Update progress display when first routes are added
    updateProgressDisplay()

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
          currentTaskInfo = `${taskName.replace('Task', '')} - ${path}`
          updateProgressDisplay()
          hooks.callHook('task-started', path, routeReport)
          return task(arg)
        })
        .then((response) => {
          // ignore this route
          if (response.tasks[taskName] === 'ignore') {
            routeReports.delete(id)
            ignoredRoutes.add(id)
            logger.debug(`Ignoring route \`${routeReport.route.path}\`.`)
            // Check if all routes are ignored/completed and trigger worker-finished
            if (monitor().status === 'completed') {
              hooks.callHook('worker-finished')
            }
            return
          }
          if (response.tasks[taskName] === 'failed')
            return
          if (response.tasks[taskName] === 'failed-retry') {
            const currentRetries = retriedRoutes.get(id) || 0
            logger.debug(`Route "${path}" (id: ${id}) failed, retry attempt ${currentRetries + 1}/3`)
            // only requeue each report 3 times max
            if (currentRetries < 3) {
              retriedRoutes.set(id, currentRetries + 1)
              requeueReport(routeReport)
            }
            else {
              logger.warn(`Route "${path}" has exceeded maximum retry attempts (3), skipping.`)
              response.tasks[taskName] = 'failed'
              routeReports.set(id, response)
            }
            return
          }

          response.tasks[taskName] = 'completed'
          routeReports.set(id, response)
          hooks.callHook('task-complete', path, response, taskName)
          const ms = Date.now() - routeReport.tasksTime?.[taskName]

          // Store actual completion time for better time estimation
          if (!taskCompletionTimes.has(id)) {
            taskCompletionTimes.set(id, {} as Record<UnlighthouseTask, number>)
          }
          taskCompletionTimes.get(id)![taskName] = ms

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

          // Update progress display
          updateProgressDisplay()

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
    const currentRetries = retriedRoutes.get(report.route.id) || 0
    logger.info(`Submitting \`${report.route.path}\` for a re-queue (attempt ${currentRetries}/3).`)
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
    clearProgressDisplay: () => progressBox.clear(),
  }
}
