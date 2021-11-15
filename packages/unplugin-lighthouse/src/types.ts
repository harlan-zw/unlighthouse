import {LH, Result} from 'lighthouse'
import {$URL} from "ufo";

export type WorkerHooks = {
  'job-added': (path: string, response: UnlighthouseRouteReport) => void
  'job-complete': (path: string, response: UnlighthouseRouteReport) => void
}

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
  definition : RouteDefinition
}

export interface NormalisedRoute  {
  id: string
  path: string
  url: string
  $url: $URL
  definition : RouteDefinition
  static: boolean
  dynamic: boolean
}

export interface UnlighthouseRouteReport {
  resolved: boolean
  htmlPayload: string
  reportHtml: string
  reportJson: string
  route: NormalisedRoute
  reportId: string
  // set on report completion
  report?: Partial<LH.Result> & {
    score: number
  }
  seo?: { title?: string; description?: string; image?: string }
}

export type NamedRouteReports = Map<string, UnlighthouseRouteReport>

export interface CliOptions extends Options {
  appPath?: string
  root?: string
  open?: boolean
  host: string
}


export interface Options {
  /**
   * Have logger debug displayed when running.
   */
  debug?: boolean
  // define your plugin options here
  outputPath?: string
  lighthouse?: LH.Flags
  puppeteerOptions?: Record<string, unknown>
  puppeteerClusterOptions?: Record<string, unknown>
}

export type LighthouseTaskArgs = { routeReport: UnlighthouseRouteReport; options: Options }
export type LighthouseTaskReturn = false|UnlighthouseRouteReport

export interface Provider {
  urls?: () => Promise<string[]>
  routeDefinitions?: () => Promise<RouteDefinition[]|undefined>
  stats?: () => Promise<Record<string, any>>
}

