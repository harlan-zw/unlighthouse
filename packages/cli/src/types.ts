import type { UnlighthouseRouteReport, ValidReportTypes } from '@unlighthouse/core'

export interface CliOptions {
  host?: string
  help?: boolean
  urls?: string
  auth?: string
  cookies?: string
  defaultQueryParams?: string
  extraHeaders?: string
  excludeUrls?: string
  includeUrls?: string
  site?: string
  routerPrefix?: string
  throttle?: boolean
  desktop?: boolean
  mobile?: boolean
  cache?: boolean
  noCache?: boolean
  version?: boolean
  root?: string
  configFile?: string
  debug?: boolean
  samples?: number
  enableI18nPages?: boolean
  disableI18nPages?: boolean
  enableJavascript?: boolean
  disableJavascript?: boolean
  disableRobotsTxt?: boolean
  disableSitemap?: boolean
  disableDynamicSampling?: boolean
  sitemaps?: string
}

export interface CiOptions extends CliOptions {
  budget: number
  buildStatic: boolean
  reporter?: ValidReportTypes | false
  lhciHost?: string
  lhciBuildToken?: string
  lhciAuth?: string
}

export { UnlighthouseRouteReport }
