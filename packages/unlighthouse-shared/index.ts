import type { LH } from 'lighthouse'
import type { $URL } from 'ufo'
import type { Hookable } from 'hookable'
import Cluster from './cluster'
import type { WS } from '../unlighthouse/src/router/broadcasting'
import {ClusterOptionsArgument, TaskFunction} from "puppeteer-cluster/dist/Cluster"
import {LaunchOptions} from "puppeteer";
import { DeepPartial } from "./utilTypes";
import {ListenOptions} from "listhen";

export * from './constants'
export * from './logger'

export interface RouteDefinition {
  name: string
  path: string
  component?: string
  componentBaseName?: string
  chunkName?: string
  _name?: string
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
  definition: RouteDefinition
}

export type LighthouseReport = Partial<LH.Result> & {
  score: number
  computed: {
    imageIssues: {
      displayValue: string|number
      score: number
    }
  }
}

export type UnlighthouseCluster = Cluster<PuppeteerTaskArgs, PuppeteerTaskReturn>

export type UnlighthouseTaskStatus = 'waiting'|'in-progress'|'completed'|'failed'

export interface UnlighthouseRouteReport {
  tasks: Record<string, UnlighthouseTaskStatus>
  htmlPayload: string
  reportHtml: string
  reportJson: string
  route: NormalisedRoute
  reportId: string
  // set on report completion
  report?: LighthouseReport
  seo?: {
    title?: string;
    description?: string;
    internalLinks?: number
    externalLinks?: number
    favicon?: string
    og?: {
      image?: string,
    }
  }
}

export type WindiResponsiveClasses = 'xs'|'sm'|'md'|'lg'|'xl'|'2xl'

export interface UnlighthouseColumn {
  label: string
  tooltip?: string
  component?: () => Promise<unknown>
  key?: string
  cols?: Partial<Record<WindiResponsiveClasses, number>>
  sortable?: boolean
  sortKey?: string
  classes?: string[]
}

declare global {
  interface Window {
    __unlighthouse_options: ResolvedUserConfig & RuntimeSettings
  }
}

export type LighthouseCategories = 'performance'|'best-practices'|'accessibility'|'seo'|'pwa'

export interface ResolvedUserConfig {
  /**
   * The path that we'll be performing the scan from, this should be the path to the app that represents the site.
   * Using this path we can auto-discover the provider
   * @default cwd()
   */
  root: string
  router: {
    /**
     * The path that the Unlighthouse middleware should run from. Useful when you want to serve the application from
     * a frameworks existing server.
     */
    prefix: string
  }
  api: {
    /**
     * The path that the API should be served from.
     * @default /api/
     */
    prefix: string
  }
  client: {
    /**
     * The columns to show for each lighthouse category.
     */
    columns: Record<LighthouseCategories, UnlighthouseColumn[]>
    /**
     * Which key to use to group the routes.
     */
    groupRoutesKey: string
  }
  scanner: {
    /**
     * How many samples of each route should be done. This is used to improve false-positive results.
     *
     * @default 1
     */
    samples: number
    /**
     * Should lighthouse run with throttling enabled. This is an alias for manually configuring lighthouse.
     *
     * @default false
     */
    throttle: boolean
    /**
     * Should the crawler be used to detect URLs.
     *
     * @default true
     */
    crawler: boolean
    /**
     * When a route definition is provided, you're able to configure the worker to sample the dynamic routes to avoid
     * redundant route reports.
     *
     * @default 5
     */
    dynamicSampling: number|false
  }
  server: Partial<ListenOptions>
  /**
   * Where to emit lighthouse reports and the runtime client.
   * @default "./lighthouse/"
   */
  outputPath: string
  /**
   * The site that will be scanned.
   */
  host: string
  /**
   * Have logger debug displayed when running.
   * @default false
   */
  debug: boolean
  /**
   * Changes the default behaviour of lighthouse.
   */
  lighthouseOptions: LH.Flags
  /**
   * Change the behaviour of puppeteer.
   */
  puppeteerOptions: LaunchOptions
  /**
   * Change the behaviour of puppeteer-cluster.
   */
  puppeteerClusterOptions: ClusterOptionsArgument
}

export type UserConfig = DeepPartial<ResolvedUserConfig>

export interface RuntimeSettings {
  /**
   * The API using the servers host name.
   */
  apiUrl: string
  /**
   * Whether we have managed to resolve definitions for the routes.
   */
  hasRouteDefinitions: boolean
  /**
   * The URL that the websocket will be served from, depends on the api.prefix. Will look something like:
   * "ws://localhost:3000/ws".
   */
  websocketUrl: string
  /**
   * The resolved local path to the generated client.
   */
  generatedClientPath: string
  /**
   * The resolved local path to the client dist.
   */
  resolvedClientPath: string
  /**
   * The resolved output path we'll be saving reports and the client in.
   */
  outputPath: string
  /**
   * Helper variable for determining if we're scanning a site in development.
   */
  isLocalhost: boolean
}

export type PuppeteerTaskArgs = UnlighthouseRouteReport
export type PuppeteerTaskReturn = UnlighthouseRouteReport
export type PuppeteerTask = TaskFunction<PuppeteerTaskArgs, PuppeteerTaskReturn>

export interface Provider {
  urls?: () => Promise<string[]>
  routeDefinitions?: () => Promise<RouteDefinition[]>
  stats?: () => Promise<Record<string, any>>
}

export type WorkerHooks = {
  'task-added': (path: string, response: UnlighthouseRouteReport) => void
  'task-started': (path: string, response: UnlighthouseRouteReport) => void
  'task-complete': (path: string, response: UnlighthouseRouteReport, taskName: string) => void
  'discovered-internal-links': (path: string, internalLinks: string[]) => Promise<void>|void
}

export type MockRouter = { match: (path: string) => RouteDefinition }

export interface UnlighthouseWorker {
  /**
   * puppeteer-cluster instance
   */
  cluster: Cluster
  /**
   * A collection of stats gathered from the cluster for the current status of the worker.
   */
  monitor: () => UnlighthouseWorkerStats
  /**
   * Queue a single normalised route. Will not process routes that have already been queued.
   * @param route
   */
  queueRoute: (route: NormalisedRoute) => void
  /**
   * Queue multiple normalised routes. This will sort the list for a better loading experience.
   * @param routes
   */
  queueRoutes: (routes: NormalisedRoute[]) => void
  /**
   * Has the worker started processing the queue.
   */
  hasStarted: () => boolean
  /**
   * The gathered map of reports. The key is the path of the route.
   */
  routeReports: Map<string, UnlighthouseRouteReport>
  /**
   * A simple array representation of the reports for easy iteration.
   */
  reports: () => UnlighthouseRouteReport[]
  /**
   * Find a report with the specified id.
   * @param id
   */
  findReport: (id: string) => UnlighthouseRouteReport|null
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
  routes: number
  monitor: UnlighthouseWorkerStats
  score: number
}

export type UnlighthouseEngineContext = {
  mockRouter?: MockRouter
  runtimeSettings: RuntimeSettings
  hooks: Hookable<WorkerHooks>
  resolvedConfig: ResolvedUserConfig
  routeDefinitions?: RouteDefinition[]
  routes?: NormalisedRoute[]
  api: any
  ws: WS
  start: (serverUrl: string) => Promise<void>
  startWithServer: () => Promise<void>
  worker: UnlighthouseWorker
  provider: Provider
}
