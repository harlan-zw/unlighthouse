// c12 loader + imperative host rules (D-020).
// `core` never runs rules — they live here, in the host package.
// defu owns merging (D-011); c12 layers the file/env/overrides, the Zod schema
// validates the post-merge result.

import type { UserConfig } from '@unlighthouse/contracts'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { ResolvableConfig } from 'c12'
import { Buffer } from 'node:buffer'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { UnlighthouseConfigSchema } from '@unlighthouse/contracts/config'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { loadConfig } from 'c12'
import { defu } from 'defu'
import { withLeadingSlash, withTrailingSlash } from 'ufo'
import { defaultConfig } from '../constants'

type ConfigOverrides = Partial<UnlighthouseConfig> | UserConfig

export interface ResolveConfigOptions {
  /** Programmatic overrides (CLI flags). Highest priority. */
  overrides?: ConfigOverrides
  /** cwd for c12 lookup (defaults to process.cwd()). */
  cwd?: string
  /** Explicit config file path/name for c12 lookup. */
  configFile?: string
}

export interface ResolvedConfigResult {
  config: UnlighthouseConfig
  configFile?: string
  layers?: unknown[]
}

/** Ported defaults — verbatim copy of `defaultConfig` from `../constants`. */
export const HOST_DEFAULTS: Partial<UnlighthouseConfig> = defaultConfig as Partial<UnlighthouseConfig>

type ScannerConfig = NonNullable<UnlighthouseConfig['scanner']>
type ChromeConfig = NonNullable<UnlighthouseConfig['chrome']>
interface ScreenEmulation {
  mobile: boolean
  width: number
  height: number
  deviceScaleFactor: number
  disabled: boolean
}
type LighthouseHostOptions = Record<string, unknown> & {
  onlyCategories?: unknown[]
  onlyAudits?: unknown[]
  throttlingMethod?: 'provided' | 'simulate' | string
  throttling?: Record<string, number>
  extraHeaders?: Record<string, string>
  formFactor?: 'mobile' | 'desktop' | string
  screenEmulation?: ScreenEmulation
  emulatedUserAgent?: string
}
type PuppeteerHostOptions = Record<string, unknown> & {
  defaultViewport?: ScreenEmulation
  args?: string[]
}
type MutableHostConfig = UnlighthouseConfig & {
  mode?: 'ci'
  scanner?: ScannerConfig
  chrome?: ChromeConfig
  lighthouseOptions: LighthouseHostOptions
  puppeteerOptions: PuppeteerHostOptions
}

// Known CI providers (env names) — used in addition to the generic `CI` flag.
const CI_PROVIDER_ENV_VARS = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'CIRCLECI',
  'TRAVIS',
  'BUILDKITE',
  'DRONE',
  'BITBUCKET_BUILD_NUMBER',
  'JENKINS_URL',
  'TEAMCITY_VERSION',
  'APPVEYOR',
]

function isCi(env: NodeJS.ProcessEnv = process.env): boolean {
  return CI_PROVIDER_ENV_VARS.some(k => !!env[k])
}

function withSlashes(s: string): string {
  return withLeadingSlash(withTrailingSlash(s)) || '/'
}

function normaliseSite(host: string): URL {
  if (!host.startsWith('http'))
    host = `http${host.startsWith('localhost') ? '' : 's'}://${host}`
  host = host.includes('.') ? host : withTrailingSlash(host)
  return new URL(host)
}

function createMutableConfig(input: UnlighthouseConfig): MutableHostConfig {
  return {
    ...input,
    lighthouseOptions: { ...(input.lighthouseOptions ?? {}) },
    puppeteerOptions: { ...(input.puppeteerOptions ?? {}) },
  }
}

function ensureScanner(config: MutableHostConfig): ScannerConfig {
  config.scanner = config.scanner ?? {}
  return config.scanner
}

function toC12Overrides(overrides: ConfigOverrides | undefined): ResolvableConfig<UnlighthouseConfig> | undefined {
  // c12 types each layer as the final config shape, but host overrides are
  // pre-merge user input. The merged value is validated by UnlighthouseConfigSchema below.
  return overrides as ResolvableConfig<UnlighthouseConfig> | undefined
}

/**
 * Apply imperative host rules on the merged config. Pure function; no I/O
 * beyond reading `process.env` (CI detection) and `process.getuid` (sandbox).
 */
function applyHostRules(input: UnlighthouseConfig, cwd: string): UnlighthouseConfig {
  const config = createMutableConfig(input)

  // Rule: GOOGLE_API_KEY env fallback.
  if (!config.googleApiKey)
    config.googleApiKey = process.env.UNLIGHTHOUSE_GOOGLE_API_KEY || process.env.GOOGLE_API_KEY

  // Rule: derive `site` from first `urls` entry if absent.
  if (!config.site && Array.isArray(config.urls) && config.urls[0])
    config.site = config.urls[0]

  // Rule: Site URL normalisation (prepend protocol; handle path).
  if (config.site && typeof config.site === 'string') {
    const siteUrl = normaliseSite(config.site)
    if (siteUrl.pathname !== '/' && siteUrl.pathname !== '') {
      const scanner = ensureScanner(config)
      scanner.sitemap = false
      scanner.robotsTxt = false
      scanner.dynamicSampling = false
      config.site = siteUrl.toString()
    }
    else {
      config.site = siteUrl.origin
    }
  }

  // Rule: CI detection → throttle off, mark CI mode.
  if (isCi()) {
    ensureScanner(config).throttle = false
    config.mode = 'ci'
  }

  // Rule: localhost → throttle off as well.
  if (config.site && /localhost|127\.0\.0\.1/.test(config.site)) {
    const scanner = ensureScanner(config)
    if (scanner.throttle !== true)
      scanner.throttle = false
  }

  // Rule: lighthouseOptions presence + onlyCategories vs onlyAudits conflict.
  if (config.lighthouseOptions.onlyCategories?.length && config.lighthouseOptions.onlyAudits?.length)
    config.lighthouseOptions.onlyCategories = []

  // Rule: derive throttling profile if not provided.
  const lh = config.lighthouseOptions
  if (typeof lh.throttlingMethod === 'undefined' && typeof lh.throttling === 'undefined') {
    if (!config.site || /localhost|127\.0\.0\.1/.test(config.site) || config.scanner?.throttle === false) {
      lh.throttlingMethod = 'provided'
      lh.throttling = {
        rttMs: 0,
        throughputKbps: 0,
        cpuSlowdownMultiplier: 1,
        requestLatencyMs: 0,
        downloadThroughputKbps: 0,
        uploadThroughputKbps: 0,
      }
    }
    else {
      lh.throttlingMethod = 'simulate'
      lh.throttling = {
        rttMs: 150,
        throughputKbps: 1.6 * 1024,
        requestLatencyMs: 150 * 4,
        downloadThroughputKbps: 1.6 * 1024,
        uploadThroughputKbps: 750,
        cpuSlowdownMultiplier: 1,
      }
    }
  }

  // Rule: always exclude cdn-cgi paths.
  const scanner = ensureScanner(config)
  scanner.exclude = scanner.exclude ?? []
  if (!scanner.exclude.includes('/cdn-cgi/*'))
    scanner.exclude.push('/cdn-cgi/*')

  // Rule: chrome defaults.
  config.chrome = defu(config.chrome || {}, {
    useSystem: true,
    useDownloadFallback: true,
    downloadFallbackCacheDir: join(homedir(), '.unlighthouse'),
  }) as ChromeConfig

  // Rule: basic-auth → Authorization extraHeader.
  if (config.auth && typeof config.auth === 'object') {
    lh.extraHeaders = lh.extraHeaders || {}
    if (!lh.extraHeaders.Authorization) {
      const credentials = `${config.auth.username}:${config.auth.password}`
      lh.extraHeaders.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`
    }
  }

  // Rule: device → formFactor + screenEmulation defaults.
  lh.formFactor = lh.formFactor || config.scanner?.device || 'mobile'
  if (lh.formFactor === 'desktop') {
    lh.screenEmulation = lh.screenEmulation || {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleFactor: 1,
      disabled: false,
    }
  }
  else {
    lh.screenEmulation = lh.screenEmulation || {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false,
    }
  }
  if (!lh.emulatedUserAgent) {
    lh.emulatedUserAgent = lh.formFactor === 'mobile'
      ? 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36'
      : 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
  }

  // Rule: top-level extraHeaders → lighthouseOptions.extraHeaders.
  if (config.extraHeaders && typeof config.extraHeaders === 'object')
    lh.extraHeaders = { ...(lh.extraHeaders || {}), ...config.extraHeaders }

  // Rule: routerPrefix slash normalisation; default to '/'.
  config.routerPrefix = config.routerPrefix ? withSlashes(config.routerPrefix) : '/'

  // Rule: puppeteer defaults.
  config.puppeteerOptions = defu(config.puppeteerOptions || {}, {
    timeout: 0,
    protocolTimeout: 0,
    headless: true,
    ignoreHTTPSErrors: true,
  }) as PuppeteerHostOptions
  config.puppeteerOptions.defaultViewport = lh.screenEmulation

  // Rule: auto --no-sandbox when running as root.
  if (process.getuid?.() === 0) {
    const args = (config.puppeteerOptions.args ??= [])
    if (!args.includes('--no-sandbox'))
      args.push('--no-sandbox')
    if (!args.includes('--disable-setuid-sandbox'))
      args.push('--disable-setuid-sandbox')
  }

  // Rule: outputPath → absolute under root/cwd.
  const root = config.root || cwd
  if (config.outputPath && !isAbsolute(config.outputPath))
    config.outputPath = resolve(root, config.outputPath)

  return config as UnlighthouseConfig
}

/**
 * Load + merge + apply host rules + validate.
 *
 * Layering (low → high precedence):
 *   HOST_DEFAULTS → c12 layers (rc files, dotenv) → config file → overrides
 */
export async function resolveConfig(opts: ResolveConfigOptions = {}): Promise<ResolvedConfigResult> {
  const cwd = opts.cwd ?? process.cwd()

  const { config, configFile, layers } = await loadConfig<UnlighthouseConfig>({
    name: 'unlighthouse',
    cwd,
    configFile: opts.configFile,
    defaults: HOST_DEFAULTS as UnlighthouseConfig,
    overrides: toC12Overrides(opts.overrides),
    dotenv: true,
  })

  const merged = applyHostRules(config, cwd)

  const parsed = UnlighthouseConfigSchema.safeParse(merged)
  if (!parsed.success) {
    throw new UnlighthouseError({
      code: 'CONFIG_INVALID',
      message: `Invalid unlighthouse config: ${parsed.error.message}`,
      cause: parsed.error,
    })
  }

  return { config: parsed.data, configFile, layers }
}
