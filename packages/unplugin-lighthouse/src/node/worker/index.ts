import {
    launchCluster,
    inspectHtmlTask,
    runLighthouseWorker,
} from '../puppeteer'
import {NormalisedRoute, Options, UnlighthouseRouteReport, WorkerHooks} from '../../types'
import { normaliseRouteJobInput, useLogger} from '../../core'
import { createHooks } from 'hookable'

export async function createUnlighthouseWorker(options: Options) {
    const hooks = createHooks<WorkerHooks>()
    const logger = useLogger()
    const cluster = await launchCluster(options)

    // @todo each job has a queue list, input output etc
    const routeReports = new Map<string, UnlighthouseRouteReport>()
    // const queuedJobs = []

    const jobs = {
        inspectHtmlTask,
        runLighthouseWorker,
    }

    const queueRoute = (route: NormalisedRoute) => {
        const { path } = route

        // don't run on named routes
        // @todo check for route params
        if (routeReports.has(path)) {
            logger.debug(`${path} has already been processed, skipping.`)
            return
        }

        const routeReport = normaliseRouteJobInput(route, options)
        logger.debug(`${path} has been queued.`)

        routeReports.set(route.id, routeReport)
        hooks.callHook('job-added', path, routeReport)

        const taskOptions = {
            routeReport,
            options,
        }

        Object.values(jobs)
            .forEach((job, key) => cluster.execute(taskOptions, job)
                .then((response) => {
                    if (!response)
                        return
                    const jobName = Object.keys(jobs)[key]
                    logger.info(`${path} has finished processing job ${jobName}.`)
                    routeReports.set(route.id, response)
                    hooks.callHook('job-complete', path, response)
                }),
            )
    }

    const queueRoutes = (routes: NormalisedRoute[]) => {
        routes.forEach(route => queueRoute(route))
    }

    const runningTasks = () => {
        return Array.from(routeReports.values()).filter(report => !report.resolved).length
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

    return {
        hooks,
        cluster,
        routeReports,
        processRoute: queueRoute,
        processRoutes: queueRoutes,
        runningTasks,
        monitor() {
            const now = Date.now();
            const timeDiff = now - cluster.startTime
            const doneTargets = cluster.allTargetCount - cluster.jobQueue.size() - cluster.workersBusy.length
            const donePercentage = cluster.allTargetCount === 0 ? 1 : (doneTargets / cluster.allTargetCount)
            const donePercStr = (100 * donePercentage).toFixed(0);
            const errorPerc = doneTargets === 0 ?
                '0.00' : (100 * cluster.errorCount / doneTargets).toFixed(2);
            const timeRunning = timeDiff;
            let timeRemainingMillis = -1;
            if (donePercentage !== 0) {
                timeRemainingMillis = Math.round(((timeDiff) / donePercentage) - timeDiff);
            }
            const timeRemining = timeRemainingMillis;
            const cpuUsage = cluster.systemMonitor.getCpuUsage().toFixed(1) + '%';
            const memoryUsage = cluster.systemMonitor.getMemoryUsage().toFixed(1) + '%';
            const pagesPerSecond = doneTargets === 0 ?
                '0' : (doneTargets * 1000 / timeDiff).toFixed(2);
            return {
                status: cluster.allTargetCount === doneTargets ? 'completed' : 'working',
                timeRunning,
                doneTargets,
                allTargets: cluster.allTargetCount,
                donePercStr,
                errorPerc,
                timeRemining,
                pagesPerSecond,
                cpuUsage,
                memoryUsage,
                workers: cluster.workers.length + cluster.workersStarting
            }
        },
        hasStarted,
        reports,
    }
}
