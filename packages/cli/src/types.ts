import type { ResolvedUserConfig, UnlighthouseRouteReport } from '@unlighthouse/core'

export interface CliOptions {
  host?: string
  help?: boolean
  urls?: string
  auth?: string
  cookies?: string
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
  v1Report?: boolean
}

export interface CiOptions extends CliOptions {
  budget: number
  buildStatic: boolean
}

export interface CiRouteReport {
  path: string
  score?: string
}

export interface V1CategoryScore {
  key: string
  id: string
  title: string
  score: number
}

export interface V1MetricScore {
  id: string
  title: string
  description: string
  numericValue: number
  numericUnit: string
  displayValue: string
}

export interface V1RouteReport extends CiRouteReport {
  categories: {
    [key: string]: V1CategoryScore
  }
  metrics: {
    [key: string]: V1MetricScore
  }
}

export interface V1CategoryAverageScore {
  key: string
  id: string
  title: string
  averageScore: number
}

export interface V1MetricAverageScore {
  id: string
  title: string
  description: string
  averageNumericValue: number
  numericUnit: string
  displayValue: string
}

export interface V1Report {
  summary: {
    score: number
    categories: {
      [key: string]: V1CategoryAverageScore
    }
    metrics: {
      [key: string]: V1MetricAverageScore
    }
  }
  routes: V1RouteReport[]
}

export type CiReport = CiRouteReport[] | V1Report

export type GenerateReport = (config: ResolvedUserConfig, unlighthouseRouteReports: UnlighthouseRouteReport[]) => CiReport

export { UnlighthouseRouteReport }
