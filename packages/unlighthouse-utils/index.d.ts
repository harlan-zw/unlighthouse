import type { LH } from 'lighthouse'
import type { $URL } from 'ufo'
import type { Hookable } from 'hookable'
import type Cluster from './cluster'
import type { WS } from '../unlighthouse/src/router/broadcasting'
import type { TaskFunction} from "puppeteer-cluster/dist/Cluster"
import type { ConcurrencyImplementationClassType } from 'puppeteer-cluster/dist/concurrency/ConcurrencyImplementation'
import type {LaunchOptions} from "puppeteer/lib/types.d.ts";
import { DeepPartial } from "./utilTypes";
import type {ListenOptions } from "listhen";
import type { App as H3App } from 'h3'
import type http from "http";
import type https from "https";

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

export type UnlighthouseTabs = 'overview'|'performance'|'best-practices'|'accessibility'|'seo'|'pwa'

export interface ResolvedUserConfig {
  /**
   * The path that we'll be performing the scan from, this should be the path to the app that represents the site.
   * Using this path we can auto-discover the provider
   * @default cwd()
   */
  root: string
  /**
   * Should reports be cached between runs for the host.
   *
   * @default true
   */
  cacheReports: boolean
  /**
   * Router options
   */
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
    columns: Record<UnlighthouseTabs, UnlighthouseColumn[]>
    /**
     * Which key to use to group the routes.
     */
    groupRoutesKey: string
  }
  scanner: {
    /**
     * Does javascript need to be executed in order to fetch internal links and SEO data.
     */
    isHtmlSSR: boolean
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
  puppeteerClusterOptions: Partial<{
    concurrency: number | ConcurrencyImplementationClassType;
    maxConcurrency: number;
    workerCreationDelay: number;
    puppeteerOptions: LaunchOptions;
    perBrowserOptions: LaunchOptions[] | undefined;
    monitor: boolean;
    timeout: number;
    retryLimit: number;
    retryDelay: number;
    skipDuplicateUrls: boolean;
    sameDomainDelay: number;
    puppeteer: any;
  }>
}

export type UserConfig = DeepPartial<ResolvedUserConfig>

export interface RuntimeSettings {
  /**
   * The URL of the server running the API and client.
   */
  serverUrl: string
  /**
   * The API using the servers host name.
   */
  apiUrl: string
  /**
   * The path of the api without the host details.
   */
  apiPath: string
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
   * The URL to the client, used for opening it automatically.
   */
  clientUrl: string
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
  /**
   * The root directory of the module.
   */
  moduleWorkingDir: string
}

export type PuppeteerTaskArgs = UnlighthouseRouteReport
export type PuppeteerTaskReturn = UnlighthouseRouteReport
export type PuppeteerTask = TaskFunction<PuppeteerTaskArgs, PuppeteerTaskReturn>

export interface Provider {
  name?: string
  urls?: () => Promise<string[]>
  mockRouter?: MockRouter
  routeDefinitions?: RouteDefinition[]|(() => RouteDefinition[]|Promise<RouteDefinition[]>)
  stats?: () => Promise<Record<string, any>>
}

export type WorkerHooks = {
  'route-definitions-provided': (routeDefinitions: any[]) => void
  'visited-client': () => void
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
   * Re-queues a report, avoiding the usual caching involved and makes sure we unlink any of the previous reports data or
   * tasks.
   *
   * @param report
   */
  requeueReport: (report: UnlighthouseRouteReport) => void
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

  /**
   * Iterates through route reports checking for a match on the route definition component, if there is a match
   * then the route is re-queued.
   *
   * @param file
   * @return True if an invalidation occurred on the routes.
   */
  invalidateFile(file: string): boolean;
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

type ServerContextArg = { url: string; server: http.Server | https.Server; app: H3App }

export type UnlighthouseContext = {
  mockRouter?: MockRouter
  runtimeSettings: RuntimeSettings
  hooks: Hookable<WorkerHooks>
  resolvedConfig: ResolvedUserConfig
  routeDefinitions?: RouteDefinition[]
  routes?: NormalisedRoute[]
  api: any
  ws: WS
  worker: UnlighthouseWorker
  provider: Provider

  // functions
  setServerContext: (arg: ServerContextArg) => void
  start: () => Promise<void>
  startWithServer: () => Promise<void>
}
