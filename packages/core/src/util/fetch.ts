import type { Logger, ResolvedUserConfig } from '@unlighthouse/contracts'
import type { ConsolaInstance } from 'consola'
import type { FetchOptions } from 'ofetch'
import { createConsola } from 'consola'
import { ofetch } from 'ofetch'
import { utf8ToBase64 } from './base64'

export interface FetchUrlResponse {
  status: number
  data: string
  headers: Headers
  url: string
  request: {
    res: {
      responseUrl: string
    }
  }
}

export interface FetchUrlClient {
  get: (url: string, opts?: FetchOptions<'text'>) => Promise<FetchUrlResponse>
}

interface FetchCache {
  _fetch?: FetchUrlClient
  /** Back-compat with callers that used to pass the Axios cache shape. */
  _axios?: FetchUrlClient
}

const _sharedContext: FetchCache = {}

function headersToRecord(headers?: HeadersInit): Record<string, string> {
  if (!headers)
    return {}
  if (headers instanceof Headers)
    return Object.fromEntries(headers.entries())
  if (Array.isArray(headers))
    return Object.fromEntries(headers)
  return { ...headers }
}

export async function createAxiosInstance(resolvedConfig: ResolvedUserConfig, cache: FetchCache = _sharedContext): Promise<FetchUrlClient> {
  const headers: Record<string, string> = {}

  if (resolvedConfig.cookies) {
    headers.Cookie = resolvedConfig.cookies
      .map(cookie => `${cookie.name}=${cookie.value}`)
      .join('; ')
  }

  const userAgent = resolvedConfig.userAgent || resolvedConfig.lighthouseOptions.emulatedUserAgent || 'Unlighthouse'
  Object.assign(headers, {
    'User-Agent': userAgent,
    ...(resolvedConfig.extraHeaders || {}),
  })

  if (resolvedConfig.auth) {
    const token = utf8ToBase64(`${resolvedConfig.auth.username}:${resolvedConfig.auth.password}`)
    headers.Authorization = `Basic ${token}`
  }

  const query = { ...(resolvedConfig.defaultQueryParams || {}) }
  const client: FetchUrlClient = {
    async get(url, opts = {}) {
      const response = await ofetch.raw<string, 'text'>(url, {
        ...opts,
        headers: {
          ...headers,
          ...headersToRecord(opts.headers),
        },
        query: {
          ...query,
          ...(opts.params || {}),
          ...(opts.query || {}),
        },
        ignoreResponseError: true,
        redirect: opts.redirect ?? 'follow',
        responseType: 'text',
        retry: false,
        timeout: opts.timeout ?? 30_000,
      })
      return {
        status: response.status,
        data: response._data ?? '',
        headers: response.headers,
        url: response.url,
        request: {
          res: {
            responseUrl: response.url,
          },
        },
      }
    },
  }

  cache._fetch = client
  cache._axios = client
  return client
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function stringProp(value: unknown, key: string): string | undefined {
  if (!isRecord(value))
    return undefined
  const prop = value[key]
  return typeof prop === 'string' ? prop : undefined
}

function errorCode(error: unknown): string | undefined {
  const cause = isRecord(error) ? error.cause : undefined
  const nestedCause = isRecord(cause) ? cause.cause : undefined
  return stringProp(error, 'code')
    ?? stringProp(cause, 'code')
    ?? stringProp(nestedCause, 'code')
    ?? stringProp(error, 'name')
}

export async function fetchUrlRaw(
  url: string,
  resolvedConfig: ResolvedUserConfig,
  opts: { logger?: Logger, cache?: FetchCache } = {},
): Promise<{ error?: unknown, redirected?: boolean, redirectUrl?: string, valid: boolean, response?: FetchUrlResponse }> {
  const logger = (opts.logger as ConsolaInstance | undefined) ?? createConsola().withTag('unlighthouse')
  const cache = opts.cache ?? _sharedContext
  const instance = cache._fetch || cache._axios || await createAxiosInstance(resolvedConfig, cache)
  const maxRetries = 3
  let attempt = 0

  while (attempt < maxRetries) {
    try {
      const response = await instance.get(url, { timeout: 30_000 })
      let responseUrl = response.request.res.responseUrl
      if (responseUrl && resolvedConfig.auth) {
        responseUrl = responseUrl.replace(/(?<=https?:\/\/)(.+?@)/g, '')
      }
      const redirected = !!responseUrl && responseUrl !== url
      const redirectUrl = responseUrl
      if (response.status < 200 || (response.status >= 300 && !redirected)) {
        return { valid: false, redirected, response, redirectUrl }
      }
      return { valid: true, redirected, response, redirectUrl }
    }
    catch (e: unknown) {
      if (isRecord(e) && e.errors)
        logger.error('Fetch error:', e.errors)
      const code = errorCode(e)
      logger.error('Fetch error message:', stringProp(e, 'message'))
      logger.error('Fetch error code:', code)
      const response = isRecord(e) ? e.response : undefined
      if (isRecord(response)) {
        logger.error('Fetch error response data:', response._data)
        logger.error('Fetch error response status:', response.status)
        logger.error('Fetch error response headers:', response.headers)
      }
      if (code === 'ETIMEDOUT' || code === 'ENETUNREACH' || code === 'TimeoutError' || code === 'AbortError') {
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
