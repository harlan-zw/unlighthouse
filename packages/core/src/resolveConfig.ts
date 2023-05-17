import { join } from 'node:path'
import { homedir } from 'node:os'
import { existsSync } from 'node:fs'
import { Buffer } from 'node:buffer'
import { createDefu, defu } from 'defu'
import { pick } from 'lodash-es'
import { pathExists } from 'fs-extra'
import { computeExecutablePath, install } from '@puppeteer/browsers'
import type { InstallOptions } from '@puppeteer/browsers'
import { Launcher } from 'chrome-launcher'
import puppeteer from 'puppeteer-core'
import { resolve } from 'mlly'
import type { ResolvedUserConfig, UnlighthouseTabs, UserConfig } from './types'
import { defaultConfig } from './constants'
import { normaliseHost, withSlashes } from './util'
import { useLogger } from './logger'

/**
 * A provided configuration from the user may require runtime transformations to avoid breaking app functionality.
 *
 * Mostly normalisation of data and provided sane runtime defaults when configuration hasn't been fully provided, also
 * includes configuration alias helpers though such as `scanner.throttle`.
 *
 * @param userConfig
 */
export const resolveUserConfig: (userConfig: UserConfig) => Promise<ResolvedUserConfig> = async (userConfig) => {
  const logger = useLogger()
  // create our own config resolution
  const merger = createDefu((obj, key, value) => {
    // avoid joining arrays, instead replace them
    if ((key === 'supportedExtensions' || key === 'onlyCategories') && value) {
      obj[key] = value
      return true
    }
  })
  const config = merger(userConfig, defaultConfig)

  // it's possible we don't know the site at runtime
  if (config.site) {
    // normalise site
    config.site = normaliseHost(config.site)
  }
  if (config.lighthouseOptions) {
    if (config.lighthouseOptions.onlyCategories?.length) {
      // restrict categories values and copy order of columns from the default config
      // @ts-expect-error 'defaultConfig.lighthouseOptions' is always set in default config
      config.lighthouseOptions.onlyCategories = defaultConfig.lighthouseOptions.onlyCategories
        .filter(column => config.lighthouseOptions.onlyCategories.includes(column))
    }
  }
  else {
    config.lighthouseOptions = {}
  }
  // for local urls we disable throttling
  if (!config.site || config.site.includes('localhost') || !config.scanner?.throttle) {
    config.lighthouseOptions.throttlingMethod = 'provided'
    config.lighthouseOptions.throttling = {
      rttMs: 0,
      throughputKbps: 0,
      cpuSlowdownMultiplier: 1,
      requestLatencyMs: 0, // 0 means unset
      downloadThroughputKbps: 0,
      uploadThroughputKbps: 0,
    }
  }

  config.scanner!.exclude = config.scanner?.exclude || []
  config.scanner!.exclude.push('/cdn-cgi/*')

  config.chrome = defu(config.chrome || {}, {
    useSystem: true,
    useDownloadFallback: true,
    downloadFallbackVersion: 1095492,
    downloadFallbackCacheDir: join(homedir(), '.unlighthouse'),
  })

  if (config.auth) {
    config.lighthouseOptions.extraHeaders = config.lighthouseOptions.extraHeaders || {}
    if (!config.lighthouseOptions.extraHeaders.Authorization) {
      const credentials = `${config.auth.username}:${config.auth.password}`
      config.lighthouseOptions.extraHeaders.Authorization = `Basic ${Buffer.from(credentials).toString('base64')}`
    }
  }

  if (config.client?.columns) {
    // filter out any columns for categories we're not showing
    config.client.columns = pick(config.client.columns, ['overview', ...config.lighthouseOptions.onlyCategories as UnlighthouseTabs[]])
  }

  // the default pages dir is `${root}/pages`, check if it exists, if not revert to root
  if (config.root && config.discovery && config.discovery.pagesDir === 'pages') {
    const pagesDirExist = await pathExists(join(config.root, config.discovery.pagesDir))
    if (!pagesDirExist) {
      logger.debug('Unable to locale page files, disabling route discovery.')
      // disable discovery to avoid globbing entire file systems
      config.discovery = false
    }
  }

  // alias to set the device
  config.lighthouseOptions.formFactor = config.lighthouseOptions.formFactor || config.scanner?.device || 'mobile'
  if (config.lighthouseOptions.formFactor === 'desktop') {
    config.lighthouseOptions.screenEmulation = {
      mobile: false,
      width: 1350,
      height: 940,
      deviceScaleFactor: 1,
      disabled: false,
    }
  }
  else {
    config.lighthouseOptions.screenEmulation = {
      mobile: true,
      width: 412,
      height: 823,
      deviceScaleFactor: 1.75,
      disabled: false,
    }
  }

  if (userConfig.extraHeaders)
    config.lighthouseOptions.extraHeaders = userConfig.extraHeaders

  if (config.routerPrefix)
    config.routerPrefix = withSlashes(config.routerPrefix)

  config.puppeteerOptions = config.puppeteerOptions || {}
  config.puppeteerClusterOptions = config.puppeteerClusterOptions || {}
  // @ts-expect-error untyped
  config.puppeteerOptions = defu(config.puppeteerOptions, {
    // set viewport
    headless: true,
    ignoreHTTPSErrors: true,
  })
  config.puppeteerOptions!.defaultViewport = config.lighthouseOptions.screenEmulation

  let foundChrome = !!config.puppeteerOptions?.executablePath
  // if user is using the default chrome binary options
  if (config.chrome.useSystem && !foundChrome) {
    // we'll try and resolve their local chrome
    const chromePath = Launcher.getFirstInstallation()
    if (chromePath) {
      logger.info(`Using system chrome located at: \`${chromePath}\`.`)
      // set default to puppeteer core
      config.puppeteerClusterOptions.puppeteer = puppeteer
      // point to our pre-installed chrome version
      config.puppeteerOptions!.executablePath = chromePath
      foundChrome = true
    }
  }
  if (!foundChrome) {
    // if we can't find their local chrome, we just need to make sure they have puppeteer, this is a similar check
    // puppeteer-cluster will do, but we can provide a nicer error
    try {
      await resolve('puppeteer')
      foundChrome = true
      logger.info('Using puppeteer dependency for chrome.')
    }
    catch (e) {
      logger.debug('Puppeteer does not exist as a dependency.', e)
    }
  }
  if (config.chrome.useDownloadFallback && !foundChrome) {
    const browserOptions = {
      cacheDir: join(homedir(), '.unlighthouse'),
      buildId: '1095492',
      browser: 'chromium',
    } as InstallOptions
    const chromePath = computeExecutablePath(browserOptions)
    if (!existsSync(chromePath)) {
      logger.warn('Failed to find chromium, attempting to download it instead.')
      let lastPercent = 0
      await install({
        ...browserOptions,
        downloadProgressCallback: (downloadedBytes, toDownloadBytes) => {
          const percent = Math.round(downloadedBytes / toDownloadBytes * 100)
          if (percent % 5 === 0 && lastPercent !== percent) {
            logger.info(`Downloading chromium: ${percent}%`)
            lastPercent = percent
          }
        },
      })
    }
    logger.info(`Using temporary downloaded chromium v1095492 located at: ${chromePath}`)
    config.puppeteerOptions!.executablePath = chromePath
    foundChrome = true
  }
  if (!foundChrome)
    throw new Error('Failed to find chrome. Please ensure you have a valid chrome installed.')
  return config as ResolvedUserConfig
}
