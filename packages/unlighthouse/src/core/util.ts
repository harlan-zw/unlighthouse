import { createHash } from 'crypto'
import { join } from 'path'
import { ensureDirSync } from 'fs-extra'
import { NormalisedRoute, UnlighthouseRouteReport } from '@shared'
import sanitize from 'sanitize-filename'
import { useUnlighthouseEngine } from './engine'
import slugify from "slugify";
import {withoutLeadingSlash, withoutTrailingSlash} from "ufo";

export const hashPathName = (path: string) => {
  return createHash('md5')
    .update(sanitiseUrlForFilePath(path))
    .digest('hex')
    .substring(0, 6)
}

export const trimSlashes = (url : string) => withoutLeadingSlash(withoutTrailingSlash(url))

export const sanitiseUrlForFilePath = (url: string) => {
    return trimSlashes(url)
        .split('/')
        .map(part => sanitize(slugify(part)))
        .join('/')
}

export const createTaskReportFromRoute
    = (route: NormalisedRoute): UnlighthouseRouteReport => {
      const { runtimeSettings } = useUnlighthouseEngine()

      const reportId = hashPathName(route.path)

      const reportPath = join(runtimeSettings.outputPath, 'routes', sanitiseUrlForFilePath(route.path))

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
