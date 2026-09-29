import type { ResolvedUserConfig, UserConfig } from '@unlighthouse/core'
import type { CiOptions, CliOptions } from './types'
import { URL } from 'node:url'
import { fetchUrlRaw, normaliseHost, useLogger } from '@unlighthouse/core'
import { defu } from 'defu'
import { pick } from 'lodash-es'
import { handleError } from './errors'

export async function validateHost(resolvedConfig: ResolvedUserConfig) {
  const site = resolvedConfig.site
  const logger = useLogger()
  // site will not be set from integrations yet
  if (site) {
    // test HTTP response from site
    logger.debug(`Testing Site \`${site}\` is valid.`)
    const { valid, response, error, redirected, redirectUrl } = await fetchUrlRaw(site, resolvedConfig)
    if (!valid) {
      // something is wrong with the site, bail
      if (response?.status)
        logger.warn(`Request to site \`${site}\` returned an invalid http status code \`${response.status}\`. lease check the URL is valid and not blocking crawlers.`)
      else
        logger.warn(`Request to site \`${site}\` threw an unhandled exception. Please check the URL is valid and not blocking crawlers.`, error)
      logger.error('Site check failed. will attempt to proceed but may fail.')
    }
    else if (response) {
      // change the URL to the redirect one, make sure it's not to a file (i.e /index.php)
      if (redirected && redirectUrl && !redirectUrl.includes('.')) {
        logger.success(`Request to site \`${site}\` redirected to \`${redirectUrl}\`, using that as the site.`)
        resolvedConfig.site = normaliseHost(redirectUrl).toString()
      }
      else {
        logger.success(`Successfully connected to \`${site}\`. (Status: \`${response.status}\`).`)
      }
    }
  }
}

export function isValidUrl(s: string) {
  try {
    const url = new URL(s)
    return !!url
  }
  catch {
    return false
  }
}

export function validateOptions(resolvedOptions: UserConfig) {
  if (!resolvedOptions.site && resolvedOptions.urls?.length)
    resolvedOptions.site = resolvedOptions.urls[0]
  if (!resolvedOptions.configFile && !resolvedOptions.site)
    return handleError('Please provide a site to scan with --site <url>.')

  if (resolvedOptions.site && !isValidUrl(resolvedOptions.site))
    return handleError('Please provide a valid site URL.')

  if (resolvedOptions?.ci?.reporter === 'lighthouseServer') {
    if (!resolvedOptions?.ci?.reporterConfig?.lhciBuildToken) {
      handleError(
        'Please provide the lighthouse server build token with --lhci-build-token.',
      )
    }
    if (!resolvedOptions?.ci?.reporterConfig?.lhciHost) {
      handleError(
        'Please provide the lighthouse server build token with --lhci-host.',
      )
    }
  }
}

/**
 * Split at the first separator only, so values such as base64 tokens keep their `=` padding.
 */
function splitOnce(str: string, separator: string): [string, string] {
  const index = str.indexOf(separator)
  if (index === -1)
    return [str, '']
  return [str.slice(0, index), str.slice(index + separator.length)]
}

/**
 * Map CLI flags to config. Only flags the user passed are set, so the config file keeps every other value.
 */
export function pickOptions(options: CiOptions | CliOptions): UserConfig {
  const picked: Omit<UserConfig, 'site' | 'root'> = {}
  picked.scanner = {}
  picked.urls = []
  if (options.throttle)
    picked.scanner.throttle = true

  if (options.sitemaps) {
    picked.scanner.sitemap = picked.scanner.sitemap || []
    options.sitemaps.split(',').forEach((path) => {
      Array.isArray(picked.scanner.sitemap) && picked.scanner.sitemap.push(path)
    })
  }

  if (options.enableJavascript)
    picked.scanner.skipJavascript = false

  else if (options.disableJavascript)
    picked.scanner.skipJavascript = true

  if (options.samples)
    picked.scanner.samples = options.samples

  if (options.enableI18nPages)
    picked.scanner.ignoreI18nPages = false
  else if (options.disableI18nPages)
    picked.scanner.ignoreI18nPages = true

  if (options.desktop)
    picked.scanner.device = 'desktop'
  else if (options.mobile)
    picked.scanner.device = 'mobile'

  if (options.disableRobotsTxt)
    picked.scanner.robotsTxt = false

  if (options.disableSitemap)
    picked.scanner.sitemap = false

  if (options.urls)
    picked.urls = options.urls.split(',')

  if (options.excludeUrls)
    picked.scanner.exclude = options.excludeUrls.split(',')

  if (options.includeUrls)
    picked.scanner.include = options.includeUrls.split(',')

  if (options.disableDynamicSampling)
    picked.scanner.dynamicSampling = false

  if (options.auth) {
    const [username, password] = splitOnce(options.auth, ':')
    picked.auth = { username, password }
  }

  function splitNameValue(str: string) {
    const [name, value] = splitOnce(str, str.includes('=') ? '=' : ':')
    return { name, value }
  }

  if (options.cookies)
    picked.cookies = options.cookies.split(';').map(splitNameValue)

  if (options.extraHeaders) {
    picked.extraHeaders = picked.extraHeaders || {}
    options.extraHeaders.split(',').forEach((header) => {
      const { name, value } = splitNameValue(header)
      picked.extraHeaders[name] = value
    })
  }

  if (options.userAgent) {
    picked.extraHeaders = picked.extraHeaders || {}
    picked.extraHeaders['User-Agent'] = options.userAgent
    // set lighthouse
    picked.lighthouseOptions = picked.lighthouseOptions || {}
    picked.lighthouseOptions.emulatedUserAgent = options.userAgent
    // pupeteer will respect userAgent
    picked.userAgent = options.userAgent
  }

  if (options.defaultQueryParams) {
    picked.defaultQueryParams = picked.defaultQueryParams || {}
    options.defaultQueryParams.split(',').forEach((param) => {
      const { name, value } = splitNameValue(param)
      picked.defaultQueryParams[name] = value
    })
  }

  const config = pick(options, [
    // root level options
    'samples',
    'site',
    'root',
    'configFile',
    'debug',
    'cache',
    'outputPath',
    'routerPrefix',
  ])
  return defu(
    config,
    picked,
  ) as UserConfig
}

/**
 * Map `unlighthouse-ci` flags to config, including the `ci` options. Only flags the user passed are set.
 */
export function pickCiOptions(options: CiOptions): UserConfig {
  const picked = pickOptions(options)
  const ci: NonNullable<UserConfig['ci']> = {}
  if (options.budget)
    ci.budget = options.budget
  if (options.buildStatic)
    ci.buildStatic = true
  if (options.reporter)
    ci.reporter = options.reporter
  const reporterConfig = Object.fromEntries(Object.entries({
    lhciHost: options.lhciHost,
    lhciBuildToken: options.lhciBuildToken,
    lhciAuth: options.lhciAuth,
  }).filter(([, value]) => value !== undefined))
  if (Object.keys(reporterConfig).length)
    ci.reporterConfig = reporterConfig
  picked.ci = ci
  return picked
}
