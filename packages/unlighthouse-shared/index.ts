import type { LH } from 'lighthouse'
import type { $URL } from 'ufo'
import type { Hookable } from 'hookable'
import Cluster from './cluster'
import type WS from '../unlighthouse/src/server/ws'
import {TaskFunction} from "puppeteer-cluster/dist/Cluster"

export interface RouteDefinition {
  name: string
  path: string
  component: string
  componentBaseName?: string
  chunkName: string
  _name: string
  layout?: string
}

export interface GeneratedRoute {
  path: string
  definition: RouteDefinition
}

export interface NormalisedRoute {
  id: string
  path: string
  url: string
  $url: $URL
  definition?: RouteDefinition
  static?: boolean
  dynamic?: boolean
}

export type LighthouseReport = Partial<LH.Result> & {
  score: number
}

export type UnlighthouseCluster = Cluster<PuppeteerTaskArgs, PuppeteerTaskReturn>

export type UnlighthouseTaskStatus = 'waiting'|'in-progress'|'completed'

export interface UnlighthouseRouteReport {
  tasks: Record<string, UnlighthouseTaskStatus>
  htmlPayload: string
  reportHtml: string
  reportJson: string
  route: NormalisedRoute
  reportId: string
  // set on report completion
  report?: LighthouseReport
  seo?: { title?: string; description?: string; image?: string }
}

export interface UnlighthouseColumn {
  label: string
  component?: () => Promise<unknown>
  key?: string
  cols?: number
  sortable?: boolean
  classes?: string[]
}

declare global {
  interface Window {
    __unlighthouse_options: Options
  }
}

export interface Options {
  resolvedClient: string
  apiPrefix: string
  clientPrefix: string
  /** @default 5 */
  dynamicRouteSampleSize: number
  host: string
  columns: UnlighthouseColumn[][],
  wsUrl: string
  apiUrl: string
  groupRoutes: boolean
  hasDefinitions: boolean
  /**
   * Have logger debug displayed when running.
   */
  debug?: boolean
  // define your plugin options here
  outputPath: string
  clientPath: string
  lighthouse?: LH.Flags
  puppeteerOptions?: Record<string, unknown>
  puppeteerClusterOptions?: Record<string, unknown>
}

export interface CliOptions extends Options {
  appPath?: string
  root?: string
  open?: boolean
}

export type PuppeteerTaskArgs = { routeReport: UnlighthouseRouteReport; options: Options }
export type PuppeteerTaskReturn = false|UnlighthouseRouteReport
export type PuppeteerTask = TaskFunction<PuppeteerTaskArgs, PuppeteerTaskReturn>

export interface Provider {
  urls?: () => Promise<string[]>
  routeDefinitions?: () => Promise<RouteDefinition[]>
  stats?: () => Promise<Record<string, any>>
}

export type WorkerHooks = {
  'task-added': (path: string, response: UnlighthouseRouteReport) => void
  'task-started': (path: string, response: UnlighthouseRouteReport) => void
  'task-complete': (path: string, response: UnlighthouseRouteReport) => void
}

export type MockRouter = { match: (path: string) => RouteDefinition }

export interface UnlighthouseWorker {
  cluster: Cluster
  routeReports: Map<string, UnlighthouseRouteReport>
  hooks: Hookable<WorkerHooks>
  monitor: () => UnlighthouseWorkerStats
  processRoute: (route: NormalisedRoute) => void
  processRoutes: (routes: NormalisedRoute[]) => void
  hasStarted: () => boolean
  reports: () => UnlighthouseRouteReport[]
}

export interface UnlighthouseWorkerStats {
  status: 'completed' | 'working'
  timeRunning: number
  doneTargets: number
  allTargets: number
  donePercStr: string,
  errorPerc: string,
  timeRemaining: number,
  pagesPerSecond: string,
  cpuUsage: string,
  memoryUsage: string,
  workers: number,
}

export interface StatsResponse {
  monitor: UnlighthouseWorkerStats
  score: number
}

export type UnlighthouseEngineContext = {
  routeDefinitions?: RouteDefinition[]
  client: string
  api: any
  ws: WS
  start: (serverUrl: string) => Promise<void>
  worker: UnlighthouseWorker
  options: Options
  provider: Provider
}
