import { createHash } from 'crypto'
import { ensureDirSync } from 'fs-extra'
import { NormalisedRoute, Options, UnlighthouseRouteReport } from '@shared'
import sanitize from 'sanitize-filename'
import {join} from "path";

export const hashPathName = (path: string) => {
    return createHash('md5')
        .update(path === '/' ? 'home' : path.replace('/', ''))
        .digest('hex')
        .substring(0, 6)
}

export const normaliseRouteForTask
    = (route: NormalisedRoute, options: Options): UnlighthouseRouteReport => {
    const reportId = hashPathName(route.path)

    let reportPath: string
    if (route.definition) {
        reportPath = join(options.outputPath, route.definition.name, route.dynamic ? reportId : '')
    } else {
        reportPath = join(options.outputPath, sanitize(route.path))
    }

    // add missing dirs
    ensureDirSync(reportPath)

    return {
        tasks: {},
        route,
        reportId,
        htmlPayload: join(reportPath, 'payload.html'),
        reportHtml: join(reportPath, 'lighthouse.html'),
        reportJson: join(reportPath, 'lighthouse.json'),
    }
}

// export const defaultOptions = (options: Partial<Options>, server: { host: string; https: boolean; port: number }) => {
//   return defu<Partial<Options>, Options>(options)
// }
