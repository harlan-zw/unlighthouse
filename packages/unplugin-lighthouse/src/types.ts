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

export interface Options {
  /**
   * Have logger debug displayed when running.
   */
  debug: boolean
  // define your plugin options here
  outputPath: string
  host: string
  lighthouse: LH.Flags
  puppeteerOptions: Record<string, unknown>
  puppeteerClusterOptions: Record<string, unknown>
}

export type LighthouseTaskArgs = { routeReport: RouteReport; options: Options }
export type LighthouseTaskReturn = false|RouteReport


