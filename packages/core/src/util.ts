import { createHash } from 'crypto'
import { join } from 'path'
import https from 'https'
import { ensureDirSync } from 'fs-extra'
import sanitize from 'sanitize-filename'
import slugify from 'slugify'
import { hasProtocol, joinURL, withLeadingSlash, withTrailingSlash, withoutLeadingSlash, withoutTrailingSlash } from 'ufo'
import type { AxiosRequestConfig, AxiosResponse } from 'axios'
import axios from 'axios'
import type { NormalisedRoute, ResolvedUserConfig, UnlighthouseRouteReport } from './types'
import { useUnlighthouse } from './unlighthouse'

export const ReportArtifacts = {
  html: 'payload.html',
  reportHtml: 'lighthouse.html',
  screenshot: 'screenshot.jpeg',
  fullScreenScreenshot: 'full-screenshot.jpeg',
  reportJson: 'lighthouse.json',
}

/**
 * Removes leading and trailing slashes from a string.
 *
 * @param s
 */
export const trimSlashes = (s: string) => withoutLeadingSlash(withoutTrailingSlash(s))

/**
 * Ensures slashes on both sides of a string
 *
 * @param s
 */
export const withSlashes = (s: string) => withLeadingSlash(withTrailingSlash(s)) || '/'

/**
 * Sanitises the provided URL for use as a file system path.
 *
 * @param url
 * @return A sanitized URL, will retain the path hierarchy in the folder structure.
 */
export const sanitiseUrlForFilePath = (url: string) => {
  url = trimSlashes(url)
  // URLs such as /something.html and /something to be considered the same
  if (url.endsWith('.html'))
    url = url.replace(/\.html$/, '')

  return url
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
  if (!hasProtocol(host))
    host = `http${host.startsWith('localhost') ? '' : 's'}://${host}`
  return withTrailingSlash(host)
}

/**
 * A task report is a wrapper for the route, the report file paths and task status.
 *
 * @param route
 */
export const createTaskReportFromRoute
  = (route: NormalisedRoute): UnlighthouseRouteReport => {
    const { runtimeSettings, resolvedConfig } = useUnlighthouse()

    const reportId = hashPathName(route.path)

    const reportPath = join(runtimeSettings.generatedClientPath, 'reports', sanitiseUrlForFilePath(route.path))

    // add missing dirs
    ensureDirSync(reportPath)

    return {
      tasks: {
        runLighthouseTask: 'waiting',
        inspectHtmlTask: 'waiting',
      },
      route,
      reportId,
      artifactPath: reportPath,
      artifactUrl: joinURL(resolvedConfig.routerPrefix, 'reports', sanitiseUrlForFilePath(route.path)),
    }
  }

export const base64ToBuffer = (dataURI: string) => {
  return Buffer.from(dataURI.split(',')[1], 'base64')
}

export const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0)
    return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}

export async function fetchUrlRaw(url: string, resolvedConfig: ResolvedUserConfig): Promise<{ error?: any; redirected?: boolean; redirectUrl?: string; valid: boolean; response?: AxiosResponse }> {
  const axiosOptions: AxiosRequestConfig = {}
  if (resolvedConfig.auth) {
    axiosOptions.auth = resolvedConfig.auth
  }

  try {
    const response = await axios.get(url, {
      // allow all SSL's
      httpsAgent: new https.Agent({
        rejectUnauthorized: false,
      }),
      ...axiosOptions,
    })
    let responseUrl = response.request.res.responseUrl
    if (responseUrl && axiosOptions.auth) {
      // remove auth credentials from url (e.g. https://user:passwd@domain.de)
      responseUrl = responseUrl.replace(/(?<=https?:\/\/)(.+@)/g, '')
    }
    const redirected = responseUrl && responseUrl !== url;
    const redirectUrl = responseUrl;
    if (response.status < 200 || (response.status >= 300 && !redirected)) {
      return {
        valid: false,
        redirected,
        response,
        redirectUrl,
      }
    }
    return {
      valid: true,
      redirected,
      response,
      redirectUrl,
    }
  }
  catch (e) {
    return {
      error: e,
      valid: false,
    }
  }
}
