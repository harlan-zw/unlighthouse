import { createHash } from 'crypto'
import { join } from 'path'
import { ensureDirSync } from 'fs-extra'
import type { NormalisedRoute, UnlighthouseRouteReport } from 'unlighthouse-utils'
import sanitize from 'sanitize-filename'
import slugify from 'slugify'
import { hasProtocol, withoutLeadingSlash, withoutTrailingSlash } from 'ufo'
import { useUnlighthouse } from './unlighthouse'

/**
 * Removes leading and trailing slashes from a string.
 *
 * @param s
 */
export const trimSlashes = (s: string) => withoutLeadingSlash(withoutTrailingSlash(s))

/**
 * Sanitises the provided URL for use as a file system path.
 *
 * @param url
 * @return A sanitized URL, will retain the path hierarchy in the folder structure.
 */
export const sanitiseUrlForFilePath = (url: string) => {
  return trimSlashes(url)
    .split('/')
    .map(part => sanitize(slugify(part)))
    .join('/')
}

/**
 * Turns a web path to a 6-char hash which can be used for easy identification.
 *
 * @param path
 */
export const hashPathName = (path: string) => {
  return createHash('md5')
    .update(sanitiseUrlForFilePath(path))
    .digest('hex')
    .substring(0, 6)
}

/**
 * Ensures a provided host is consistent, ensuring a protocol is provided.
 *
 * @param host
 */
export const normaliseHost = (host: string) => {
  host = withoutTrailingSlash(host)
  if (!hasProtocol(host))
    host = `http${host.startsWith('localhost') ? '' : 's'}://${host}`
  return host
}

/**
 * A task report is a wrapper for the route, the report file paths and task status.
 *
 * @param route
 */
export const createTaskReportFromRoute
    = (route: NormalisedRoute): UnlighthouseRouteReport => {
      const { runtimeSettings } = useUnlighthouse()

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
