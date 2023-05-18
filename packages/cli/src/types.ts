import { UnlighthouseRouteReport, ResolvedUserConfig } from "@unlighthouse/core"

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

export interface V1RouteReport extends CiRouteReport {
  categories: { [key: string]: {
      key: string,
      id: string,
      title: string,
      score: number,
    }
  }
}

export interface V1Report {
  summary: {
    score: number
    categories: { [key: string]: {
        key: string,
        id: string,
        title: string,
        averageScore: number,
      }
    }
  }
  routes: V1RouteReport[]
}

export type CiReport = CiRouteReport[] | V1Report

export type GenerateReport = (config: ResolvedUserConfig, unlighthouseRouteReports: UnlighthouseRouteReport[]) => CiReport
