import type http from 'http'
import type https from 'https'
import type { $URL } from 'ufo'
import type { LH } from 'lighthouse'
import type { LaunchOptions } from 'puppeteer'
import type { Hookable } from 'hookable'
import type { Cluster, TaskFunction } from '../cluster'
import type { WS } from './router'

/**
 * A route definition is a mapping of a component, and it's URL path (or paths) that it represents.
 *
 * The page component has multiple representations:
 * - static route, whereby the name matches the path (/about.vue -> /about/),
 * - dynamic route where a query is used to generate a set of paths (/posts/:id.vue -> /posts/my-first-post/)
 * - catch-all route where the any missed paths will be caught (/404.vue -> /some-missing-page)
 *
 * Additional meta-data is provided to give more context of how the mapping behaves, such as which layout to use, which
 * asset chunk it belongs to.
 *
 * Different frameworks represent this data differently, this one is based on Nuxt.js
 */
export interface RouteDefinition {
  name: string
  path: string
  component?: string
  componentBaseName?: string
  chunkName?: string
  _name?: string
  layout?: string
}

/**
 * A normalised route, in the context of unlighthouse, is a mapping between a URL path, it's definition and a unique id.
 */
export interface NormalisedRoute {
  id: string
  path: string
  url: string
  $url: $URL
  definition: RouteDefinition
}

/**
 * An augmented Lighthouse Report type, we add custom types to the base report for specific functionality on the
 * @unlighthouse/client.
 */
export type LighthouseReport = Partial<LH.Result> & {
  /**
   * The total score for the result, this is the sum of each category's result
   */
  score: number
  computed: {
    /**
     * An aggregation of multiple image audit results.
     */
    imageIssues: {
      displayValue: string|number
      score: number
    }
  }
}

/**
 * Tasks that Unlighthouse will run, used to track their status.
 */
export type UnlighthouseTask = 'inspectHtmlTask'|'runLighthouseTask'

/**
 * Each task ran by unlighthouse (extractHtmlPayload, runLighthouseTask) has a specific status which we can expose.
 */
export type UnlighthouseTaskStatus = 'waiting'|'in-progress'|'completed'|'failed'

/**
 * A fairly rigid representation of the puppeteer cluster task results (extractHtmlPayload, runLighthouseTask), combined
 * with the normalised route.
 */
export interface UnlighthouseRouteReport {
  /**
   * The mapping of tasks with their status.
   */
  tasks: Record<UnlighthouseTask, UnlighthouseTaskStatus>
  /**
   * Path to the HTML extracted payload.
   */
  htmlPayload: string
  /**
   * Lighthouse Result report exported to HTML.
   */
  reportHtml: string
  /**
   * Lighthouse Result report exported to JSON.
   */
  reportJson: string
  /**
   * The route (URL Path) that the report belongs to.
   */
  route: NormalisedRoute
  /**
   * A unique representation of the route, useful for the API layer.
   */
  reportId: string
  /**
   * The lighthouse result, only set once the task is completed.
   */
  report?: LighthouseReport
  /**
   * The SEO meta-data, only set once the html payload has been extracted and passed.
   */
  seo?: {
    title?: string
    description?: string
    internalLinks?: number
    externalLinks?: number
    favicon?: string
    og?: {
      image?: string
    }
  }
}

export type WindiResponsiveClasses = 'xs'|'sm'|'md'|'lg'|'xl'|'2xl'

/**
 * A column will generally be either a direct mapping to a lighthouse audit (such as console errors) or a computed mapping to
 * multiple lighthouse audits (such as image issues).
 *
 * It can also exist as a mapping to the SEO meta-data (such as meta description).
 */
export interface UnlighthouseColumn {
  /**
   * The column header name.
   */
  label: string
  /**
   * If the user hovers over the label they'll see a tooltip for extra context.
   */
  tooltip?: string
  /**
   * A component instance which should be used to render the column cells contents.
   */
  component?: () => Promise<unknown>
  /**
   * The key within the UnlighthouseRouteReport that maps to the column, used for automatic value inferring.
   */
  key?: string
  /**
   * Column sizing definition, needed for a responsive UI.
   */
  cols?: Partial<Record<WindiResponsiveClasses, number>>
  /**
   * Can the column can be sorted?
   *
   * @default false
   */
  sortable?: boolean
  /**
   * The key within the UnlighthouseRouteReport that is used to sort the column. This will default to the key if not provided.
   */
  sortKey?: string
  /**
   * Extra classes that should be added to the column.
   */
  classes?: string[]
}

/**
 * All available tab keys.
 */
export type LighthouseCategories = 'performance'|'best-practices'|'accessibility'|'seo'|'pwa'
export type UnlighthouseTabs = 'overview'|LighthouseCategories
export interface MockRouter { match: (path: string) => RouteDefinition }

export interface DiscoveryOptions {
  /**
   * The location of the page files that will be matched to routes.
   * Note: This is for fallback behaviour when the integration doesn't provide a way to gather the route definitions.
   */
  pagesDir: string
  /**
   * Which file extensions in the pages dir should be considered.
   *
   * Note: This is for fallback behaviour when the integration doesn't provide a way to gather the route definitions.
   */
  supportedExtensions: string[]
}

export interface ClientOptions {
  /**
   * The columns to show for each lighthouse category.
   */
  columns: Record<UnlighthouseTabs, UnlighthouseColumn[]>
  /**
   * Which key to use to group the routes.
   */
  groupRoutesKey: string
}

export interface GenerateClientOptions {
  static?: boolean
}

export interface ResolvedUserConfig {
  /**
   * The path that we'll be performing the scan from, this should be the path to the app that represents the site.
   * Using this path we can auto-discover the provider
   * @default cwd()
   */
  root: string
  /**
   * Should reports be saved to the local file system and re-used between runs for the scanned host.
   *
   * Note: This makes use of cache-bursting for when the configuration changes, since this may change the report output.
   *
   * @default true
   */
  cacheReports: boolean
  /**
   * Load the configuration from a custom config file. By default, it attempts to load configuration from `unlighthouse.config.ts`.
   */
  configFile?: string
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
  ci: {
    /**
     * Provide a budget for each page as a numeric total score, or an object mapping the category to the score. Should be
     * a number between 1-100.
     */
    budget: number|Record<Partial<LighthouseCategories>, number>
    /**
     * Injects the required data into the client files, so it can be hosted statically.
     */
    buildStatic: boolean
  }
  api: {
    /**
     * The path that the API should be served from.
     * @default /api/
     */
    prefix: string
  }
  client: ClientOptions
  discovery: false|DiscoveryOptions
  scanner: {
    /**
     * Paths to explicitly include from the search, this will exclude any paths not listed here.
     */
    include?: string[]
    /**
     * Paths to ignore from scanning.
     */
    exclude?: string[]
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

    /**
     * Whether the sitemap.xml will be attempted to be read from the host.
     *
     * @default true
     */
    sitemap: boolean
  }
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
    concurrency: number | unknown
    maxConcurrency: number
    workerCreationDelay: number
    puppeteerOptions: LaunchOptions
    perBrowserOptions: LaunchOptions[] | undefined
    monitor: boolean
    timeout: number
    retryLimit: number
    retryDelay: number
    skipDuplicateUrls: boolean
    sameDomainDelay: number
    puppeteer: any
  }>
}

export type DeepPartial<T> = T extends Function ? T : (T extends object ? { [P in keyof T]?: DeepPartial<T[P]>; } : T)
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
   * if the user has configured unlighthouse using a configuration file, this is the link to it.
   */
  configFile?: string
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

export interface UnlighthouseWorkerStats {
  /**
   * Status of the worker, completed when all tasks have been completed.
   */
  status: 'completed' | 'working'
  /**
   * Time in ms that the worker has been running
   */
  timeRunning: number
  /**
   * How many tasks have been completed.
   */
  doneTargets: number
  /**
   * Total number of tasks including completed, pending and working.
   */
  allTargets: number
  /**
   * The % of work completed.
   */
  donePercStr: string
  /**
   * The % of errors.
   */
  errorPerc: string
  /**
   * The remaining time until all tasks are completed.
   */
  timeRemaining: number
  /**
   * How many tasks per second are being processed.
   */
  pagesPerSecond: string
  /**
   * The devices CPU usage % out of 100
   */
  cpuUsage: string
  /**
   * The devices memory usage % out of 100
   */
  memoryUsage: string
  /**
   * How many workers are now working, usually the cpu count of the device.
   */
  workers: number
}

export type PuppeteerTaskArgs = UnlighthouseRouteReport
export type PuppeteerTaskReturn = UnlighthouseRouteReport
export type PuppeteerTask = TaskFunction<PuppeteerTaskArgs, PuppeteerTaskReturn>
export type UnlighthousePuppeteerCluster = Cluster<PuppeteerTaskArgs, PuppeteerTaskReturn>

/**
 * Each integration will potentially have their own way of providing the route definitions and the routing of those
 * definitions.
 */
export interface Provider {
  /**
   * Used to debug.
   */
  name?: string
  /**
   * Optionally provide a list of URLs that should be used before pulling them from a sitemap or manual crawl.
   */
  urls?: () => Promise<string[]>
  /**
   * To match a URL path to a route definition we need a router. Different definitions need different routes.
   */
  mockRouter?: MockRouter | ((routeDefinitions: RouteDefinition[]) => MockRouter)
  /**
   * The collection of route definitions belonging to the provider. These can be inferred but aren't 100% correct,
   * frameworks that can provide these should do so.
   */
  routeDefinitions?: RouteDefinition[]|(() => RouteDefinition[]|Promise<RouteDefinition[]>)
}

export type HookResult = Promise<void>|void

export interface UnlighthouseHooks {
  /**
   * Called when the worker has finished processing all queued routes. Will be called multiple times if routes are
   * re-queued.
   *
   * Mostly useful for the CI environment.
   */
  'worker-finished': () => HookResult
  /**
   * When route definitions are provided to Unlighthouse this function will be called, useful for delaying internal logic
   * until the definitions are found.
   *
   * @param routeDefinitions
   */
  'route-definitions-provided': (routeDefinitions: any[]) => HookResult
  /**
   * Called when a user visits the path of the @unlighthouse/client. Useful for starting the worker on-demand.
   */
  'visited-client': () => HookResult
  /**
   * Fired when a new task is added to the queue worker.
   * @param path
   * @param response
   */
  'task-added': (path: string, response: UnlighthouseRouteReport) => HookResult
  /**
   * Fired when a task has started to work.
   * @param path
   * @param response
   */
  'task-started': (path: string, response: UnlighthouseRouteReport) => HookResult
  /**
   * Fired when a task has completed it's work.
   * @param path
   * @param response
   */
  'task-complete': (path: string, response: UnlighthouseRouteReport, taskName: string) => HookResult
  /**
   * Fired when a path discovered internal links, used for "crawl" mode.
   * @param path
   * @param internalLinks
   */
  'discovered-internal-links': (path: string, internalLinks: string[]) => HookResult
}

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
  invalidateFile: (file: string) => boolean
}

export interface ScanMeta {
  /**
   * Total count of discovered routes
   */
  routes: number
  /**
   * How are worker is operating
   */
  monitor?: UnlighthouseWorkerStats
  /**
   * Aggregate score for the site
   */
  score: number
  /**
   * Discovered favicon of the host site.
   */
  favicon?: string
}

export interface ServerContextArg {
  url: string
  server: http.Server | https.Server
  app: { use: any }
}

/**
 * The main core of Unlighthouse, provides access to all functionality and can be accessed anywhere using `useUnlighthouse()`.
 */
export interface UnlighthouseContext {
  /**
   * The mock router being used to match paths to route definitions.
   */
  mockRouter?: MockRouter
  /**
   * Settings that are computed from runtime data.
   */
  runtimeSettings: RuntimeSettings
  /**
   * Access the hook system, either calling a hook or listening to one.
   */
  hooks: Hookable<UnlighthouseHooks>
  /**
   * User config that has been normalised.
   */
  resolvedConfig: ResolvedUserConfig
  /**
   * The collection of route definitions associated to the host.
   */
  routeDefinitions?: RouteDefinition[]
  /**
   * Discovered routes.
   */
  routes?: NormalisedRoute[]
  /**
   * A reference to the API middleware.
   */
  api: any
  /**
   * A reference to the websocket interface, used to broadcast data.
   */
  ws: WS
  /**
   * Access the worker environment, queue tasks, inspect progress, etc.
   */
  worker: UnlighthouseWorker
  /**
   * Provider details
   */
  provider: Provider

  /**
   * To use Unlighthouse with a client, it needs a server / app to register the API and client middleware.
   *
   * @param arg
   */
  setServerContext: (arg: ServerContextArg) => Promise<UnlighthouseContext>
  /**
   * Running Unlighthouse via CI does not require a server or the client so we have a special utility for it.
   */
  setCiContext: () => Promise<UnlighthouseContext>
  /**
   * Start the client and the queue worker. A server context must be provided before this function is called.
   */
  start: () => Promise<UnlighthouseContext>
}
