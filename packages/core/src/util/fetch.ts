import type { Logger, ResolvedUserConfig } from '@unlighthouse/contracts'
import type { ConsolaInstance } from 'consola'
import type { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import axios from 'axios'
import { createConsola } from 'consola'

const _sharedContext: { _axios?: AxiosInstance } = {}

export async function createAxiosInstance(resolvedConfig: ResolvedUserConfig, cache: { _axios?: AxiosInstance } = _sharedContext) {
  dns.setServers(['8.8.8.8', '1.1.1.1'])
  const resolver = new dns.Resolver()
  resolver.setServers(['8.8.8.8', '1.1.1.1'])

  const axiosOptions: AxiosRequestConfig = {}
  if (resolvedConfig.auth)
    axiosOptions.auth = resolvedConfig.auth

  axiosOptions.headers = axiosOptions.headers || {}

  if (resolvedConfig.cookies) {
    axiosOptions.headers.Cookie = resolvedConfig.cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ')
  }

  const userAgent = resolvedConfig.userAgent || resolvedConfig.lighthouseOptions.emulatedUserAgent || 'Unlighthouse'
  axiosOptions.headers = {
    'User-Agent': userAgent,
    ...(resolvedConfig.extraHeaders || {}),
    ...axiosOptions.headers,
  }

  if (resolvedConfig.defaultQueryParams)
    axiosOptions.params = { ...resolvedConfig.defaultQueryParams, ...axiosOptions.params }

  axiosOptions.httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, timeout: 30_000 })
  axiosOptions.httpAgent = new http.Agent({ keepAlive: true, timeout: 30_000 })
  axiosOptions.proxy = false
  axiosOptions.timeout = 30_000
  axiosOptions.withCredentials = true

  cache._axios = axios.create(axiosOptions)
  return cache._axios
}

export async function fetchUrlRaw(
  url: string,
  resolvedConfig: ResolvedUserConfig,
  opts: { logger?: Logger, cache?: { _axios?: AxiosInstance } } = {},
): Promise<{ error?: any, redirected?: boolean, redirectUrl?: string, valid: boolean, response?: AxiosResponse }> {
  const logger = (opts.logger as ConsolaInstance | undefined) ?? createConsola().withTag('unlighthouse')
  const cache = opts.cache ?? _sharedContext
  const instance: AxiosInstance = cache._axios || await createAxiosInstance(resolvedConfig, cache)
  const maxRetries = 3
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      const response = await instance.get(url, { timeout: 30_000 })
      let responseUrl = response.request.res.responseUrl
      if (responseUrl && resolvedConfig.auth) {
        responseUrl = responseUrl.replace(/(?<=https?:\/\/)(.+?@)/g, '')
      }
      const redirected = responseUrl && responseUrl !== url
      const redirectUrl = responseUrl
      if (response.status < 200 || (response.status >= 300 && !redirected)) {
        return { valid: false, redirected, response, redirectUrl }
      }
      return { valid: true, redirected, response, redirectUrl }
    }
    catch (e: any) {
      if (e.errors)
        logger.error('Axios error:', e.errors)
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
      return { error: e, valid: false }
    }
  }
  return { error: new Error('Max retries reached'), valid: false }
}

export const ReportArtifacts = {
  html: 'payload.html',
  reportHtml: 'lighthouse.html',
  screenshot: 'screenshot.jpeg',
  fullScreenScreenshot: 'full-screenshot.jpeg',
  screenshotThumbnailsDir: '__screenshot-thumbnails__',
  reportJson: 'lighthouse.json',
}
