import type { Device, DeviceMatrix, Logger } from '@unlighthouse/contracts'
import type { ResolvedUserConfig, UserConfig } from '../index.ts'
import type { CiOptions, CliOptions } from './types'
import { URL } from 'node:url'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { isDevice, normaliseDeviceMatrix } from '@unlighthouse/contracts/types/atoms'
import { defu } from 'defu'
import { fetchUrlRaw, normaliseHost } from '../index.ts'
import { handleError } from './errors'

const VALID_DEVICES: readonly Device[] = ['mobile', 'desktop']

function pickKeys<K extends string>(source: object, keys: readonly K[]): Partial<Record<K, unknown>> {
  const picked: Partial<Record<K, unknown>> = {}
  for (const key of keys) {
    if (key in source)
      picked[key] = (source as Record<K, unknown>)[key]
  }
  return picked
}

/**
 * Parse the `--device` CLI flag into a deduplicated ordered list. Accepts a
 * single value (`mobile`) or a comma-separated list (`mobile,desktop`).
 * When the flag is absent returns `undefined`. Exits via `handleError` on
 * an invalid value so the caller doesn't have to.
 *
 * When both `--device` and one of `--mobile`/`--desktop` are supplied,
 * `--device` wins. When `--device` is absent the legacy `--mobile`/`--desktop`
 * booleans drive `scanner.device` exactly as before.
 */
export function parseDevices(options: CiOptions | CliOptions): DeviceMatrix | undefined {
  if (typeof options.device !== 'string' || options.device.trim() === '')
    return undefined
  const parts = options.device.split(',').map(s => s.trim()).filter(Boolean)
  if (parts.length === 0)
    return undefined
  const seen = new Set<Device>()
  const out: Device[] = []
  for (const part of parts) {
    if (!isDevice(part)) {
      handleError(
        `Invalid --device value "${part}". Expected one of: ${VALID_DEVICES.join(', ')}, or a comma-separated list (e.g. "mobile,desktop").`,
      )
      return undefined
    }
    if (!seen.has(part)) {
      seen.add(part)
      out.push(part)
    }
  }
  return normaliseDeviceMatrix(out)
}

export async function validateHost(resolvedConfig: ResolvedUserConfig, logger?: Logger) {
  const site = resolvedConfig.site
  // site will not be set from integrations yet
  if (site) {
    // test HTTP response from site
    logger?.debug(`Testing Site \`${site}\` is valid.`)
    const { valid, response, error, redirected, redirectUrl } = await fetchUrlRaw(site, resolvedConfig)
    if (!valid) {
      // something is wrong with the site, bail
      logOperationalWarn('host.site_validation_failed', error ?? null, {
        site,
        status: response?.status ?? null,
      }, logger)
      logger?.error('Site check failed. will attempt to proceed but may fail.')
    }
    else if (response) {
      // change the URL to the redirect one, make sure it's not to a file (i.e /index.php)
      if (redirected && redirectUrl && !redirectUrl.includes('.')) {
        logger?.success(`Request to site \`${site}\` redirected to \`${redirectUrl}\`, using that as the site.`)
        resolvedConfig.site = normaliseHost(redirectUrl).toString()
      }
      else {
        logger?.success(`Successfully connected to \`${site}\`. (Status: \`${response.status}\`).`)
      }
    }
  }
}

export function isValidUrl(s: string) {
  try {
    const url = new URL(s)
    return !!url
  }
  catch (_err) {
    // CLI validation treats malformed URLs as invalid input.
    return false
  }
}

export function validateOptions(resolvedOptions: UserConfig) {
  if (!resolvedOptions.site && Array.isArray(resolvedOptions.urls) && resolvedOptions.urls.length)
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

export function pickOptions(options: CiOptions | CliOptions): UserConfig {
  const picked: Omit<UserConfig, 'site' | 'root'> = {
    scanner: {},
    urls: [],
  }
  const scanner: NonNullable<UserConfig['scanner']> = {}
  picked.scanner = scanner
  picked.urls = []
  if (options.noCache)
    picked.cache = true
  if (options.throttle)
    scanner.throttle = true

  if (options.sitemaps) {
    scanner.sitemap = scanner.sitemap || []
    options.sitemaps.split(',').forEach((path) => {
      Array.isArray(scanner.sitemap) && scanner.sitemap.push(path)
    })
  }

  if (options.enableJavascript)
    scanner.skipJavascript = false

  else if (options.disableJavascript)
    scanner.skipJavascript = true

  if (options.samples)
    scanner.samples = options.samples

  if (options.enableI18nPages)
    scanner.ignoreI18nPages = false
  else if (options.disableI18nPages)
    scanner.ignoreI18nPages = true

  // `--device` wins over `--mobile`/`--desktop` (back-compat). For a
  // single-device list we set `scanner.device` directly. For a multi-device
  // list we still set `scanner.device` to the first (primary) device for
  // back-compat with adapters/UI reading `config.scanner.device`; the full
  // matrix is surfaced to `host.start()` via `parseDevices` in cli/ci.ts and
  // flows through `core.run({ overrides: { device } })`.
  const devices = parseDevices(options)
  if (devices && devices.length > 0)
    scanner.device = devices[0]
  else if (options.desktop)
    scanner.device = 'desktop'
  else if (options.mobile)
    scanner.device = 'mobile'

  if (options.disableRobotsTxt)
    scanner.robotsTxt = false

  if (options.disableSitemap)
    scanner.sitemap = false

  if (options.urls)
    picked.urls = options.urls.split(',')

  if (options.excludeUrls)
    scanner.exclude = options.excludeUrls.split(',')

  if (options.includeUrls)
    scanner.include = options.includeUrls.split(',')

  if (options.disableDynamicSampling)
    scanner.dynamicSampling = false

  if (options.auth) {
    const [username, password] = options.auth.split(':')
    picked.auth = { username, password }
  }

  function splitNameValue(str: string) {
    const splitToken = str.includes('=') ? '=' : ':'
    const [name, value] = str.split(splitToken)
    return { name: name || '', value: value || '' }
  }

  if (options.cookies)
    picked.cookies = options.cookies.split(';').map(splitNameValue)

  if (options.extraHeaders) {
    const extraHeaders: Record<string, string> = {}
    options.extraHeaders.split(',').forEach((header) => {
      const { name, value } = splitNameValue(header)
      extraHeaders[name] = value
    })
    picked.extraHeaders = extraHeaders
  }

  if (options.userAgent) {
    const extraHeaders = typeof picked.extraHeaders === 'object' && picked.extraHeaders ? picked.extraHeaders : {}
    extraHeaders['User-Agent'] = options.userAgent
    picked.extraHeaders = extraHeaders
    // set lighthouse
    picked.lighthouseOptions = picked.lighthouseOptions || {}
    picked.lighthouseOptions.emulatedUserAgent = options.userAgent
    // pupeteer will respect userAgent
    picked.userAgent = options.userAgent
  }

  if (options.defaultQueryParams) {
    const defaultQueryParams: Record<string, string> = {}
    options.defaultQueryParams.split(',').forEach((param) => {
      const { name, value } = splitNameValue(param)
      defaultQueryParams[name] = value
    })
    picked.defaultQueryParams = defaultQueryParams
  }

  const config = pickKeys(options, [
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
