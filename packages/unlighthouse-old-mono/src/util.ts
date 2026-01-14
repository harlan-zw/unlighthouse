import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import type { NormalisedRoute, ResolvedUserConfig, UnlighthouseRouteReport } from './types'
import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import { join } from 'node:path'
import axios from 'axios'
import { ensureDirSync } from 'fs-extra'
import sanitize from 'sanitize-filename'
import slugify from 'slugify'
import { joinURL, withLeadingSlash, withoutLeadingSlash, withoutTrailingSlash, withTrailingSlash } from 'ufo'
import { useLogger, useUnlighthouse } from './unlighthouse'

export const ReportArtifacts = {
  html: 'payload.html',
  reportHtml: 'lighthouse.html',
  screenshot: 'screenshot.jpeg',
  fullScreenScreenshot: 'full-screenshot.jpeg',
  screenshotThumbnailsDir: '__screenshot-thumbnails__',
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
export function sanitiseUrlForFilePath(url: string) {
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
export function hashPathName(path: string) {
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
export function normaliseHost(host: string) {
  if (!host.startsWith('http'))
    host = `http${host.startsWith('localhost') ? '' : 's'}://${host}`
  host = host.includes('.') ? host : withTrailingSlash(host)
  // strip pathname from host
  return new URL(host)
}

/**
 * A task report is a wrapper for the route, the report file paths and task status.
 *
 * @param route
 */
export function createTaskReportFromRoute(route: NormalisedRoute): UnlighthouseRouteReport {
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

export function base64ToBuffer(dataURI: string) {
  return Buffer.from(dataURI.split(',')[1], 'base64')
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0)
    return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}

const _sharedContext = {}

function sharedContext() {
  return useUnlighthouse() || _sharedContext
}

export async function createAxiosInstance(resolvedConfig: ResolvedUserConfig) {
  // try and resolve dns lookup issues
  dns.setServers([
    '8.8.8.8', // Google
    '1.1.1.1', // Cloudflare
  ])
  const resolver = new dns.Resolver()
  resolver.setServers([
    '8.8.8.8', // Google
    '1.1.1.1', // Cloudflare
  ])
  const axiosOptions: AxiosRequestConfig = {}
  if (resolvedConfig.auth)
    axiosOptions.auth = resolvedConfig.auth

  axiosOptions.headers = axiosOptions.headers || {}
  // this should always be set

  if (resolvedConfig.cookies) {
    axiosOptions.headers.Cookie = resolvedConfig.cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ')
  }

  const userAgent = resolvedConfig.userAgent || resolvedConfig.lighthouseOptions.emulatedUserAgent || 'Unlighthouse'
  axiosOptions.headers = {
    // fallback user agent, allow overriding
    'User-Agent': userAgent,
    ...(resolvedConfig.extraHeaders || {}),
    ...axiosOptions.headers,
  }

  if (resolvedConfig.defaultQueryParams)
    axiosOptions.params = { ...resolvedConfig.defaultQueryParams, ...axiosOptions.params }

  axiosOptions.httpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    timeout: 30_000,
  })
  axiosOptions.httpAgent = new http.Agent({
    keepAlive: true,
    timeout: 30_000,
  })
  axiosOptions.proxy = false
  axiosOptions.timeout = 30_000
  axiosOptions.withCredentials = true
  const unlighthouse = sharedContext()
  unlighthouse._axios = axios.create(axiosOptions)
  return unlighthouse._axios
}

export async function fetchUrlRaw(url: string, resolvedConfig: ResolvedUserConfig): Promise<{ error?: any, redirected?: boolean, redirectUrl?: string, valid: boolean, response?: AxiosResponse }> {
  const logger = useLogger()
  const unlighthouse = sharedContext()
  const instance: AxiosInstance = unlighthouse._axios || await createAxiosInstance(resolvedConfig)
  const maxRetries = 3
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      const response = await instance.get(url, { timeout: 30_000 })
      let responseUrl = response.request.res.responseUrl
      if (responseUrl && resolvedConfig.auth) {
        // remove auth credentials from url (e.g. https://user:passwd@domain.de)
        responseUrl = responseUrl.replace(/(?<=https?:\/\/)(.+?@)/g, '')
      }
      const redirected = responseUrl && responseUrl !== url
      const redirectUrl = responseUrl
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
    catch (e: any) {
      if (e.errors) {
        logger.error('Axios error:', e.errors)
      }
      logger.error('Axios error message:', e.message)
      logger.error('Axios error code:', e.code)
      if (e.response) {
        logger.error('Axios error response data:', e.response.data)
        logger.error('Axios error response status:', e.response.status)
        logger.error('Axios error response headers:', e.response.headers)
      }
      if (e.code === 'ETIMEDOUT' || e.code === 'ENETUNREACH') {
        attempt++
        logger.info(`Retrying request... (${attempt}/${maxRetries})`)
        continue
      }
      return {
        error: e,
        valid: false,
      }
    }
  }
  return {
    error: new Error('Max retries reached'),
    valid: false,
  }
}
