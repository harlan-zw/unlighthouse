import { createHash } from 'crypto'
import defu from 'defu'
import { Options, RouteReport } from '../types'
import {$URL} from "ufo";

export const generateReportIdFromRoute
    = (route: $URL) => {
    return createHash('md5')
        .update(route.pathname === '/' ? 'home' : route.pathname.replace('/', ''))
        .digest('hex')
        .substring(0, 6)
}
export const normaliseRouteJobInput
    = (url: $URL, options: Options): RouteReport => {
      const reportId = generateReportIdFromRoute(url)
      return {
        route: {
            ...url,
            fullRoute: url.toString(),
        },
        reportId,
        fullRoute:  url.toString(),
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
