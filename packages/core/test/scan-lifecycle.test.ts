import type { NormalisedRoute, UnlighthouseHooks, UnlighthouseRouteReport } from '../src/types'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { createHooks } from 'hookable'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

let testContext: any
let testCluster: any
let tempDir = ''

vi.mock('../src/unlighthouse', () => ({
  useUnlighthouse: () => testContext,
}))

vi.mock('../src/logger', () => ({
  useLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}))

vi.mock('../src/util/progressBox', () => ({
  createProgressBox: () => ({
    update: vi.fn(),
    clear: vi.fn(),
  }),
}))

vi.mock('../src/puppeteer/cluster', () => ({
  launchPuppeteerCluster: vi.fn(async () => testCluster),
}))

import { createUnlighthouseWorker } from '../src/puppeteer/worker'
import { createTaskReportFromRoute } from '../src/util'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (value: T) => void
}

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((innerResolve) => {
    resolve = innerResolve
  })
  return { promise, resolve }
}

function createRoute(path: string): NormalisedRoute {
  const url = `https://example.com${path}`
  return {
    id: path,
    path,
    url,
    $url: new URL(url),
    definition: {
      name: path === '/' ? 'index' : path.slice(1),
      path,
    },
  }
}

function createClusterMock() {
  return {
    jobQueue: {
      size: () => 0,
      shift: () => undefined,
      clear: () => undefined,
    },
    workersBusy: [] as any[],
    workers: [] as any[],
    workersStarting: 0,
    allTargetCount: 0,
    errorCount: 0,
    startTime: Date.now(),
    systemMonitor: {
      getCpuUsage: () => 0,
      getMemoryUsage: () => 0,
    },
    execute: vi.fn(async (data, task) => {
      const busyToken = {}
      testCluster.allTargetCount += 1
      testCluster.workersBusy.push(busyToken)

      try {
        return await task({
          data,
          page: {},
        })
      }
      finally {
        const index = testCluster.workersBusy.indexOf(busyToken)
        if (index >= 0)
          testCluster.workersBusy.splice(index, 1)
      }
    }),
  }
}

function createCompletedReport(routeReport: UnlighthouseRouteReport): UnlighthouseRouteReport {
  return {
    ...routeReport,
    report: {
      score: 1,
      categories: [],
      computed: {
        imageIssues: { displayValue: 0, score: 1 },
        ariaIssues: { displayValue: 0, score: 1 },
      },
    } as any,
  }
}

describe('scan lifecycle isolation', () => {
  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'unlighthouse-scan-lifecycle-'))
    testCluster = createClusterMock()
    testContext = {
      runtimeSettings: {
        generatedClientPath: tempDir,
        currentScanId: 'scan-a',
      },
      resolvedConfig: {
        routerPrefix: '',
        discovery: false,
        cache: false,
        scanner: {
          maxRoutes: false,
          robotsTxt: false,
          _robotsTxtRules: [],
          include: undefined,
          exclude: undefined,
          dynamicSampling: 0,
          samples: 1,
        },
        client: {
          groupRoutesKey: 'route.definition.name',
          columns: {},
        },
      },
      hooks: createHooks<UnlighthouseHooks>(),
    }
  })

  afterEach(() => {
    if (tempDir)
      rmSync(tempDir, { recursive: true, force: true })
  })

  it('creates scan-scoped artifact paths for repeated runs', () => {
    const route = createRoute('/about')

    const first = createTaskReportFromRoute(route)
    expect(first.artifactPath).toContain(`${join('reports', 'scan-a', 'about')}`)
    expect(first.artifactUrl).toBe('reports/scan-a/about')

    testContext.runtimeSettings.currentScanId = 'scan-b'
    const second = createTaskReportFromRoute(route)

    expect(second.artifactPath).toContain(`${join('reports', 'scan-b', 'about')}`)
    expect(second.artifactUrl).toBe('reports/scan-b/about')
    expect(second.artifactPath).not.toBe(first.artifactPath)
  })

  it('ignores stale completions after cancel/reset and keeps writes in the old run folder', async () => {
    const route = createRoute('/about')
    const pendingRuns = new Map<string, { deferred: Deferred<UnlighthouseRouteReport>, routeReport: UnlighthouseRouteReport }>()

    const worker = await createUnlighthouseWorker({
      inspectHtmlTask: async ({ data }) => {
        data.seo = { htmlSize: 10 }
        return data
      },
      runLighthouseTask: ({ data }) => {
        const deferred = createDeferred<UnlighthouseRouteReport>()
        pendingRuns.set(data.artifactPath, { deferred, routeReport: data })
        return deferred.promise
      },
    })

    worker.queueRoutes([route])

    await vi.waitFor(() => {
      expect(pendingRuns.size).toBe(1)
    })

    const firstRunPath = [...pendingRuns.keys()][0]!
    const firstRun = pendingRuns.get(firstRunPath)!

    worker.cancel()

    testContext.runtimeSettings.currentScanId = 'scan-b'
    worker.reset()
    worker.resume()
    worker.queueRoutes([route])

    await vi.waitFor(() => {
      expect(pendingRuns.size).toBe(2)
    })

    const secondRunPath = [...pendingRuns.keys()].find(path => path !== firstRunPath)!
    const secondRun = pendingRuns.get(secondRunPath)!

    writeFileSync(join(firstRunPath, 'stale.txt'), 'old run artifact')
    firstRun.deferred.resolve(createCompletedReport(firstRun.routeReport))
    await Promise.resolve()
    await Promise.resolve()

    expect(worker.reports()).toHaveLength(1)
    expect(worker.reports()[0]!.artifactPath).toBe(secondRunPath)
    expect(existsSync(join(firstRunPath, 'stale.txt'))).toBe(true)
    expect(existsSync(join(secondRunPath, 'stale.txt'))).toBe(false)

    writeFileSync(join(secondRunPath, 'fresh.txt'), 'new run artifact')
    secondRun.deferred.resolve(createCompletedReport(secondRun.routeReport))

    await vi.waitFor(() => {
      expect(worker.reports()[0]!.report?.score).toBe(1)
    })

    expect(readFileSync(join(secondRunPath, 'fresh.txt'), 'utf-8')).toBe('new run artifact')
    expect(worker.reports()[0]!.artifactPath).toBe(secondRunPath)
  })
})
