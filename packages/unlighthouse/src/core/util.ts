import { createHash } from 'crypto'
import { ensureDirSync } from 'fs-extra'
import { NormalisedRoute, Options, UnlighthouseRouteReport } from '@shared'

export const hashPathName = (path: string) => {
  return createHash('md5')
    .update(path === '/' ? 'home' : path.replace('/', ''))
    .digest('hex')
    .substring(0, 6)
}

export const normaliseRouteForTask
    = (route: NormalisedRoute, options: Options): UnlighthouseRouteReport => {
      const reportId = hashPathName(route.path)

      const reportPath = `${options.outputPath}/${route.definition.name}${route.dynamic ? `/${reportId}` : ''}`

      // add missing dirs
      ensureDirSync(reportPath)

      return {
        tasks: {},
        route,
        reportId,
        htmlPayload: `${reportPath}/payload.html`,
        reportHtml: `${reportPath}/lighthouse.html`,
        reportJson: `${reportPath}/lighthouse.json`,
      }
    }

// export const defaultOptions = (options: Partial<Options>, server: { host: string; https: boolean; port: number }) => {
//   return defu<Partial<Options>, Options>(options)
// }
