import { URL } from 'url'
import type { ResolvedUserConfig, UserConfig } from '@unlighthouse/core'
import { pick } from 'lodash-es'
import { defu } from 'defu'
import { fetchUrlRaw, normaliseHost, useLogger } from '@unlighthouse/core'
import { handleError } from './errors'
import type { CiOptions, CliOptions } from './types'

export const validateHost = async (resolvedConfig: ResolvedUserConfig) => {
  const logger = useLogger()
  // site will not be set from integrations yet
  if (resolvedConfig.site) {
    // test HTTP response from site
    logger.debug(`Testing Site \`${resolvedConfig.site}\` is valid.`)
    const { valid, response, error, redirected, redirectUrl } = await fetchUrlRaw(resolvedConfig.site, resolvedConfig)
    if (!valid) {
      // something is wrong with the site, bail
      if (response?.status)
        logger.fatal(`Request to site \`${resolvedConfig.site}\` returned an invalid http status code \`${response.status}\`. Please check the URL is valid.`)
      else
        logger.fatal(`Request to site \`${resolvedConfig.site}\` threw an unhandled exception. Please check the URL is valid.`, error)

      // bail on cli or ci
      process.exit(1)
    }
    else if (response) {
      // change the URL to the redirect one, make sure it's not to a file (i.e /index.php)
      if (redirected && redirectUrl && !redirectUrl.includes('.')) {
        logger.success(`Request to site \`${resolvedConfig.site}\` redirected to \`${redirectUrl}\`, using that as the site.`)
        resolvedConfig.site = normaliseHost(redirectUrl)
      }
      else {
        logger.success(`Successfully connected to \`${resolvedConfig.site}\`, status code: \`${response.status}\`.`)
      }
    }
  }
}

export const isValidUrl = (s: string) => {
  try {
    const url = new URL(s)
    return !!url
  }
  catch (err) {
    return false
  }
}

export const validateOptions = (resolvedOptions: UserConfig) => {
  if (!resolvedOptions.site)
    return handleError('Please provide a site to scan with --site <url>.')

  if (!isValidUrl(resolvedOptions.site))
    return handleError('Please provide a valid site URL.')
}

export function pickOptions(options: CiOptions | CliOptions): UserConfig {
  const picked: Omit<UserConfig, 'site' | 'root'> = {}
  picked.scanner = {}
  picked.urls = []
  if (options.noCache)
    picked.cache = true
  if (options.throttle)
    picked.scanner.throttle = true

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

  const config = pick(options, [
    // root level options
    'samples',
    'site',
    'root',
    'configFile',
    'debug',
    'cache',
    'outputPath',
  ])
  return defu(
    config,
    picked,
  ) as UserConfig
}
