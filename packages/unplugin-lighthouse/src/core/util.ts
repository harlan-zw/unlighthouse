import { createHash } from 'crypto'
import defu from 'defu'
import { NormalisedRoute, Options, UnlighthouseRouteReport} from '../types'
import fs from "fs";

export const hashPathName = (path: string) => {
    return createHash('md5')
        .update(path === '/' ? 'home' : path.replace('/', ''))
        .digest('hex')
        .substring(0, 6)
}

export const normaliseRouteJobInput
    = (route: NormalisedRoute, options: Options): UnlighthouseRouteReport => {
    const reportId = hashPathName(route.path)

    const reportPath = `${options.outputPath}/${route.definition.name}${route.dynamic ? '/' + reportId : ''}`

    // add missing dirs
    if (!fs.existsSync(reportPath)) {
        fs.mkdirSync(reportPath, { recursive: true })
    }

    return {
        route,
        reportId,
        htmlPayload: `${reportPath}/payload.html`,
        reportHtml: `${reportPath}/lighthouse.html`,
        reportJson: `${reportPath}/lighthouse.json`,
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
