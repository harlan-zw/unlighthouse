import { createHash } from 'crypto'
import defu from 'defu'
import { Cluster } from 'puppeteer-cluster'
import { RouteDefinition } from '../types/nuxt'
import { Options, RouteReport } from '../types'

export const generateReportIdFromRoute
    = (route: RouteDefinition) => createHash('md5')
      .update(route.path === '/' ? 'home' : route.path.replaceAll('/', ''))
      .digest('hex')
      .substring(0, 6)

export const generateRouteReportInput
    = (route: RouteDefinition, options: Options): RouteReport => {
      const reportId = generateReportIdFromRoute(route)
      return {
        route,
        reportId,
        fullRoute: `${options.host}${route.path}`,
        reportHtml: `${options.outputPath}/${reportId}.html`,
        reportJson: `${options.outputPath}/${reportId}.json`,
        resolved: false,
      }
    }

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 B'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`
}

export const defaultOptions = (options: Partial<Options>, server: { host: string; https: boolean; port: number }) => {
  return defu<Partial<Options>, Options>(options, )
}
