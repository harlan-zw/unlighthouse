import {LH, Result} from 'lighthouse'

export interface RouteDefinition {
  name: string
  path: string
  component: string
  chunkName: string
  _name: string
  layout?: string
}

export interface RouteReport {
  score?: number;
  resolved: boolean
  reportHtml: string
  reportJson: string
  fullRoute: string
  route: RouteDefinition
  reportId: string
  // set on report completion
  report?: string | LH.Result// json
  seo?: { title?: string; description?: string; image?: string }
}

export type NamedRouteReports = Map<string, RouteReport>

export interface CliOptions extends Options {
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

export type LighthouseTaskArgs = { routeReport: RouteReport; options: Options }
export type LighthouseTaskReturn = false|RouteReport

export interface Provider {
  routes: () => Promise<RouteDefinition[]>
  stats?: () => Promise<Record<string, any>>
}

