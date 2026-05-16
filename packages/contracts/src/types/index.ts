import type { Options as ChromeLaunchOptions } from 'chrome-launcher'
import type { NestedHooks } from 'hookable'
import type { Config, Flags, Result } from 'lighthouse'
import type { ListenOptions } from 'listhen'
import type http from 'node:http'
import type https from 'node:https'
import type { Page, LaunchOptions as PuppeteerLaunchOptions } from 'puppeteer-core'
import type { QueryObject } from 'ufo'

export * from './atoms'

// Opaque type for the WebSocket broadcaster; the concrete class lives in @unlighthouse/core.
// Contracts must not import from core, so we use a structural placeholder here.
export interface WS {
  serve: (req: any) => any
  broadcast: (data: any) => void
  clients: Set<any>
}

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
  file?: string
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
  $url: URL
  definition: RouteDefinition
  /**
   * A runtime path that the route was discovered from, useful if the route is a 404 and we want to know what directed
   * us to it.
   */
  discoveredFrom?: string
}

export interface ComputedLighthouseReportAudit {
  details?: {
    items?: any[]
  }
  displayValue: string | number
  score: number
}
/**
 * An augmented Lighthouse Report type, we add custom types to the base report for specific functionality on the
 * @unlighthouse/ui.
 */
export interface LighthouseReportCategory {
  key: string
  id: string
  title: string
  score: number | null
}

export type LighthouseReportAudit = Result['audits'][string]

export type LighthouseReport = Omit<Partial<Result>, 'categories' | 'audits'> & {
  /**
   * The total score for the result, this is the sum of each category's result
   */
  score: number
  categories: LighthouseReportCategory[]
  audits: Record<string, LighthouseReportAudit>
  computed: {
    /**
     * An aggregation of multiple image audit results.
     */
    imageIssues: ComputedLighthouseReportAudit
    ariaIssues: ComputedLighthouseReportAudit
  }
}

/**
 * Tasks that Unlighthouse will run, used to track their status.
 */
export type UnlighthouseTask = 'inspectHtmlTask' | 'runLighthouseTask'

/**
 * Each task ran by unlighthouse (extractHtmlPayload, runLighthouseTask) has a specific status which we can expose.
 */
export type UnlighthouseTaskStatus = 'waiting' | 'in-progress' | 'completed' | 'failed' | 'ignore' | 'failed-retry'

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
   * Track how long tasks are taking
   */
  tasksTime?: Partial<Record<UnlighthouseTask, number>>
  /**
   * Path to where the artifacts from a URL scan are saved.
   */
  artifactPath: string
  /**
   * URL of where the artifacts are stored, for static client access.
   */
  artifactUrl: string
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
  seo?: HTMLExtractPayload
}

export interface HTMLExtractPayload {
  alternativeLangDefault?: string
  alternativeLangDefaultHtml?: string
  title?: string
  description?: string
  metaDescription?: string // alias for description, used by SEO processor
  internalLinks?: number
  externalLinks?: number
  htmlSize?: number
  favicon?: string
  canonical?: string
  robots?: string
  og?: {
    description?: string
    title?: string
    image?: string
    url?: string
    type?: string
  }
  twitter?: {
    card?: string
    title?: string
    description?: string
    image?: string
    site?: string
  }
  hreflang?: Array<{ lang: string, href: string }>
  jsonLd?: any[]
}

export type ValidReportTypes = 'jsonSimple' | 'jsonExpanded' | 'lighthouseServer'

export type AssertionType = 'minScore' | 'maxNumericValue' | 'maxRegression'

export interface Assertion {
  type: AssertionType
  /** Category for minScore: performance, accessibility, seo, best-practices */
  category?: string
  /** Metric for maxNumericValue: lcp, cls, tbt, fcp, si, ttfb */
  metric?: string
  /** Threshold value */
  value: number
  /** Fail if any single route fails, or only if the average fails */
  failOn?: 'any' | 'average'
}

export interface AssertionResult {
  assertion: Assertion
  passed: boolean
  actual: number
  /** Routes that failed this assertion (when failOn is 'any') */
  failingRoutes?: { url: string, path: string, value: number }[]
}

export interface ReporterConfig {
  lhciHost?: string
  lhciBuildToken?: string
  lhciAuth?: string
}

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
   * Display the column header icon as a warning.
   */
  warning?: boolean
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
   *
   * @default 2
   */
  cols?: number
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
export type LighthouseCategories = 'performance' | 'best-practices' | 'accessibility' | 'seo'
export type UnlighthouseTabs = 'overview' | LighthouseCategories

export interface DiscoveryOptions {
  /**
   * The location of the page files that will be matched to routes.
   * Note: This is for fallback behaviour when the integration doesn't provide a way to gather the route definitions.
   *
   * @default './pages'
   */
  pagesDir: string
  /**
   * Which file extensions in the pages dir should be considered.
   *
   * Note: This is for fallback behaviour when the integration doesn't provide a way to gather the route definitions.
   *
   * @default ['vue', 'md']
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
   * The site that will be scanned.
   */
  site: string
  /**
   * Google API key used for optional integrations such as the CrUX History API.
   * Falls back to UNLIGHTHOUSE_GOOGLE_API_KEY / GOOGLE_API_KEY env vars.
   */
  googleApiKey?: string
  /**
   * The path that we'll be performing the scan from, this should be the path to the app that represents the site.
   * Using this path we can auto-discover the provider
   * @default cwd()
   */
  root: string
  /**
   * Should reports be saved to the local file system and re-used between runs for the scanned site.
   *
   * Note: This makes use of cache-bursting for when the configuration changes, since this may change the report output.
   *
   * @default true
   */
  cache: boolean
  /**
   * Optional basic auth credentials
   *
   * @default false
   */
  auth: false | { username: string, password: string }
  /**
   * Cookies to add to HTTP requests.
   *
   * @default false
   */
  cookies: false | { name: string, value: string, [v: string]: string }[]
  /**
   * Local storage to add to the browser context.
   *
   * @default {}
   */
  localStorage: Record<string, any>
  /**
   * Session storage to add to the browser context.
   *
   * @default {}
   */
  sessionStorage: Record<string, any>
  /**
   * Extra headers to provide for any HTTP requests.
   *
   * @default false
   */
  extraHeaders: false | Record<string, string>
  /**
   * The user agent to use for all requests. Uses default puppeteer / lighthouse user agent if not provided.
   *
   * @default false
   */
  userAgent?: string
  /**
   * Query params to add to every request.
   *
   * @default false
   */
  defaultQueryParams: false | QueryObject
  /**
   * Load the configuration from a custom config file.
   * By default, it attempts to load configuration from `unlighthouse.config.ts`.
   *
   * You can set up multiple configuration files for different sites you want to scan.
   * For example:
   * - `staging-unlighthouse.config.ts`
   * - `production-unlighthouse.config.ts`
   */
  configFile?: string
  /**
   * Where to emit lighthouse reports and the runtime client.
   *
   * @default "./unlighthouse"
   */
  outputPath: string
  /**
   * Display the loggers' debug messages.
   * @default false
   */
  debug: boolean
  /**
   * Hooks to run to augment the behaviour of Unlighthouse.
   */
  hooks?: NestedHooks<UnlighthouseHooks>
  /**
   * The URL path prefix for the client and API to run from.
   * Useful when you want to serve the application from an existing integrations server, you could use /__unlighthouse
   *
   * @default ''
   */
  routerPrefix: string
  /**
   * The path that the API should be served from.
   *
   * @default /api/
   */
  apiPrefix: string
  /**
   * Options passed to listhen when the built-in UI server is started.
   */
  server: Partial<ListenOptions> & {
    open?: boolean
  }
  /**
   * Provide a list of URLs that should be used explicitly.
   * Will disable sitemap and crawler.
   *
   * @see https://unlighthouse.dev/guide/url-discovery.html#manually-providing-urls
   * @default []
   */
  urls: string[] | (() => string[]) | (() => Promise<string[]>)
  ci: {
    /**
     * Provide a budget for each page as a numeric total score, or an object mapping the category to the score. Should be
     * a number between 1-100.
     */
    budget: number | Partial<Record<LighthouseCategories, number>>
    /**
     * Injects the required data into the client files, so it can be hosted statically.
     */
    buildStatic: boolean
    /**
     * The type of report that will be generated from the results.
     *
     * @default 'jsonSimple'
     */
    reporter: ValidReportTypes | false
    /**
     * Additional configuration passed to the reporter.
     */
    reporterConfig?: ReporterConfig
    /**
     * Assertions to evaluate after scan completion.
     * CI will exit with code 1 if any assertion fails.
     *
     * @example
     * ```ts
     * assertions: [
     *   { type: 'minScore', category: 'performance', value: 0.8 },
     *   { type: 'minScore', category: 'accessibility', value: 0.9 },
     *   { type: 'maxNumericValue', metric: 'lcp', value: 2500 },
     *   { type: 'maxRegression', metric: 'lcp', value: 500 },
     * ]
     * ```
     */
    assertions?: Assertion[]
    /**
     * Build metadata recorded against the scan. Used to label CI runs and
     * surface the branch / commit that produced a given result.
     * Defaults fall back to common CI env vars when unset.
     */
    build?: {
      /** Git branch name. Defaults to GITHUB_REF_NAME / CI_COMMIT_REF_NAME env. */
      branch?: string
      /** Git commit SHA. Defaults to GITHUB_SHA / CI_COMMIT_SHA env. */
      commit?: string
      /** Commit message. */
      commitMessage?: string
    }
    /**
     * Controls automatic scan-to-scan comparison.
     */
    comparison?: {
      /** Disable auto-comparison against the previous scan for the same site. */
      enabled?: boolean
      /** Override per-metric regression thresholds (stored-unit absolute values). */
      thresholds?: Partial<Record<
        'lcp' | 'cls' | 'tbt' | 'fcp' | 'si' | 'ttfb' | 'inp' | 'performance' | 'accessibility' | 'bestPractices' | 'seo',
        number
      >>
    }
  }
  /**
   * See https://unlighthouse.dev/guide/client.html
   */
  client: ClientOptions
  /**
   * See https://unlighthouse.dev/guide/route-definitions.html
   */
  discovery: false | DiscoveryOptions
  scanner: {
    /**
     * Setup custom mappings for a regex string to a route definition.
     * This is useful when you have a complex site which doesn't use URL path segments
     * to separate pages.
     *
     * @see https://unlighthouse.dev/guide/route-definitions.html#custom-sampling
     * @default {}
     */
    customSampling: Record<string, RouteDefinition>
    /**
     * When the page HTML is extracted and processed, we look for a x-default link to identify if the page is an i18n
     * copy of another page.
     * If it is, then we skip it because it would be a duplicate scan.
     *
     * @default true
     */
    ignoreI18nPages: boolean
    /**
     * The maximum number of routes that should be processed.
     * This helps avoid issues when the site requires a specific
     * configuration to be able to run properly
     *
     * @default 200
     */
    maxRoutes: number | false
    /**
     * Paths to explicitly include from the search, this will exclude any paths not listed here.
     *
     * @see https://unlighthouse.dev/guide/large-sites.html#include-url-patterns
     */
    include?: (string | RegExp)[]
    /**
     * Paths to ignore from scanning.
     *
     * @see https://unlighthouse.dev/guide/large-sites.html#exclude-url-patterns
     */
    exclude?: (string | RegExp)[]
    /**
     * Does javascript need to be executed in order to fetch internal links and SEO data.
     *
     * @see https://unlighthouse.dev/guide/spa.html
     */
    skipJavascript: boolean
    /**
     * How many samples of each route should be done.
     * This is used to improve false-positive results.
     *
     * @see https://unlighthouse.dev/guide/improving-accuracy.html
     * @default 1
     */
    samples: number
    /**
     * Should lighthouse run with throttling enabled? This is an alias for manually configuring lighthouse.
     *
     * @see https://unlighthouse.dev/guide/device.html#alias-enable-disable-throttling
     * @default false
     */
    throttle: boolean
    /**
     * Should the crawler be used to detect URLs.
     *
     * @see https://unlighthouse.dev/guide/crawling.html
     * @default true
     */
    crawler: boolean
    /**
     * When a route definition is provided, you're able to configure the worker to sample the dynamic routes to avoid
     * redundant route reports.
     *
     * @see https://unlighthouse.dev/guide/large-sites.html#change-dynamic-sampling-limit
     * @default 5
     */
    dynamicSampling: number | false
    /**
     * Whether the sitemap.xml will be attempted to be read from the site.
     *
     * @default true
     */
    sitemap: boolean | string[]
    /**
     * Whether the robots.txt will be attempted to be read from the site.
     *
     * @default true
     */
    robotsTxt: boolean
    /**
     * Alias to switch the device used for scanning.
     * Set to false if you want to manually configure it.
     *
     * @default 'mobile'
     */
    device: 'mobile' | 'desktop' | false
    /**
     * Resolved robots.txt groups.
     * @internal
     */
    _robotsTxtRules?: any
  }
  /**
   * Changes the default behaviour of lighthouse.
   */
  lighthouseOptions: Flags
  /**
   * Change the behaviour of puppeteer.
   */
  puppeteerOptions: PuppeteerLaunchOptions
  chrome: {
    /**
     * Should chrome be attempted to be used from the system.
     *
     * @default true
     */
    useSystem: boolean
    /**
     * If no chrome can be found in the system, should a download fallback be attempted.
     *
     * @default true
     */
    useDownloadFallback: boolean
    /**
     * When downloading the fallback which version of chrome should be used.
     *
     * @default 1095492
     */
    downloadFallbackVersion: string | number
    /**
     * The directory to install the downloaded fallback browser.
     *
     * @default $home/.unlighthouse
     */
    downloadFallbackCacheDir: string
  }
}

export type ClientOptionsPayload = Pick<ResolvedUserConfig, 'client' | 'site' | 'lighthouseOptions' | 'scanner' | 'routerPrefix'>
  & Pick<RuntimeSettings, 'websocketUrl' | 'apiUrl'>

type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends (...args: any[]) => any
    ? T[K]
    : T[K] extends Array<infer U>
      ? Array<DeepPartial<U>>
      : T[K] extends object
        ? DeepPartial<T[K]>
        : T[K]
}

export type UserConfig = DeepPartial<ResolvedUserConfig>

export interface RuntimeSettings {
  /**
   * A URL instance of the site for easier use of the host.
   */
  siteUrl: URL
  /**
   * The URL of the server running the API and client.
   */
  serverUrl: string
  /**
   * The full URL for API.
   */
  apiUrl: string
  /**
   * The path of the api without the site URL.
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
   * When caching we need to generate a unique key based on config.
   */
  configCacheKey?: string
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
   * The currently active scan id, used to isolate per-scan artifacts.
   */
  currentScanId: string | null
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
   * The root directory of the module.
   */
  moduleWorkingDir: string
  /**
   * The path to the lighthouse worker.
   */
  lighthouseProcessPath: string

  /**
   * The server instance.
   */
  server: http.Server | https.Server
}

export type HookResult = Promise<void> | void

/**
 * Legacy user-config hooks. Surfaces the events the engine emits before/after
 * resolving config and during a scan. The v1 `HookMap` (in `./hooks`) is the
 * core hook bus; this interface is the user-facing config-side shape and stays
 * for `UnlighthouseConfig.hooks` to keep the public surface stable.
 */
export interface UnlighthouseHooks {
  'site-changed': (site: string) => HookResult
  'resolved-config': (resolvedConfig: ResolvedUserConfig) => HookResult
  'worker-finished': () => HookResult
  'worker-cancelled': () => HookResult
  'worker-error': (error: Error) => HookResult
  'visited-client': () => HookResult
  'task-added': (path: string, response: UnlighthouseRouteReport) => HookResult
  'task-started': (path: string, response: UnlighthouseRouteReport) => HookResult
  'task-complete': (path: string, response: UnlighthouseRouteReport, taskName: string) => HookResult
  'discovered-internal-links': (path: string, internalLinks: string[]) => HookResult
  'puppeteer:before-goto': (page: Page) => HookResult
  'authenticate': (page: Page) => HookResult
}

export interface ScanMeta {
  /**
   * Total count of discovered routes
   */
  routes: number
  /**
   * Aggregate score for the site
   */
  score: number
  /**
   * Discovered site favicon.
   */
  favicon?: string
}

export interface UnlighthouseOptions {
  provider?: UnlighthouseProvider
  lighthouseConfig?: Config
  lighthouseFlags?: Flags
  port?: number
  logLevel?: 'info' | 'error' | 'silent' | 'verbose'
  emulatedFormFactor?: 'mobile' | 'desktop'
  width?: number
  height?: number
  launchOptions?: ChromeLaunchOptions
}

export type UnlighthouseProvider = (url: string, options?: UnlighthouseOptions) => Promise<UnlighthouseReport>

export interface UnlighthouseInsights {
  score: number
  categories: Record<string, {
    id: string
    title: string
    score: number
  }>
  coreWebVitals: {
    lcp: number
    cls: number
    fcp: number
    tbt: number
    si: number
  }
}

export interface UnlighthouseReport {
  url: string
  fetchTime: string
  insights: UnlighthouseInsights
  artifacts?: any
  raw?: Result
  // Gzipped LHCI-format LHR. Set by providers that produce a raw Lighthouse
  // run (local, mock, cdp-connect); core's ingest path persists it to the
  // blob store under the route's `lhrBlobKey` when present.
  lhrGzip?: Uint8Array
}
