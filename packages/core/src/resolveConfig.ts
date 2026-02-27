import type { InstallOptions } from '@puppeteer/browsers'
import type { ResolvedUserConfig, UnlighthouseTabs, UserConfig } from './types'
import { Buffer } from 'node:buffer'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path, { join, resolve } from 'node:path'
import { computeExecutablePath, detectBrowserPlatform, install } from '@puppeteer/browsers'
import { Launcher } from 'chrome-launcher'
import { createDefu, defu } from 'defu'
import { pathExists } from 'fs-extra'
import { pick } from 'lodash-es'
import { resolve as resolveModule } from 'mlly'
import puppeteer, { launch } from 'puppeteer-core'
import { PUPPETEER_REVISIONS } from 'puppeteer-core/lib/cjs/puppeteer/revisions.js'
import { defaultConfig } from './constants'
import { useLogger } from './logger'
import { normaliseHost, withSlashes } from './util'

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

  if (!config.site && Array.isArray(config.urls) && config.urls?.[0])
    config.site = config.urls[0]

  // it's possible we don't know the site at runtime
  if (config.site) {
    // normalise site
    const siteUrl = normaliseHost(config.site)
    if (siteUrl.pathname !== '/' && siteUrl.pathname !== '') {
      logger.warn('You are providing a site with a path, disabling sitemap, robots and dynamic sampling.')
      config.scanner = config.scanner || {}
      config.scanner.sitemap = false
      config.scanner.robotsTxt = false
      config.scanner.dynamicSampling = false
      config.site = siteUrl.toString()
    }
    else {
      config.site = siteUrl.origin
    }
  }
  if (config.lighthouseOptions) {
    if (config.lighthouseOptions.onlyCategories?.length) {
      if (config.lighthouseOptions.onlyAudits?.length) {
        logger.warn('You have specified both `onlyCategories` and `onlyAudits`. `onlyCategories` will be ignored.')
        config.lighthouseOptions.onlyCategories = []
      }
      else {
        // restrict categories values and copy order of columns from the default config
        config.lighthouseOptions.onlyCategories = defaultConfig.lighthouseOptions!.onlyCategories!
          .filter(column => config.lighthouseOptions!.onlyCategories!.includes(column))
      }
    }
  }
  else {
    config.lighthouseOptions = {}
  }
  if (typeof config.lighthouseOptions.throttlingMethod === 'undefined' && typeof config.lighthouseOptions.throttling === 'undefined') {
    // for local urls we disable throttling
    if (typeof config.scanner?.throttle) {
      config.lighthouseOptions.throttlingMethod = 'simulate'
      // we need a custom throttling profile to account for the  cpu / network already getting blasted
      config.lighthouseOptions.throttling = {
        rttMs: 150,
        throughputKbps: 1.6 * 1024,
        requestLatencyMs: 150 * 4,
        downloadThroughputKbps: 1.6 * 1024,
        uploadThroughputKbps: 750,
        cpuSlowdownMultiplier: 1,
      }
    }
    else if (!config.site || config.site.includes('localhost') || config.scanner?.throttle === false) {
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
  }

  config.scanner!.exclude = config.scanner?.exclude || []
  config.scanner!.exclude.push('/cdn-cgi/*')

  config.chrome = defu(config.chrome || {}, {
    useSystem: true,
    useDownloadFallback: true,
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

  if (!config.lighthouseOptions.emulatedUserAgent) {
    if (config.lighthouseOptions.formFactor === 'mobile')
      config.lighthouseOptions.emulatedUserAgent = 'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Mobile Safari/537.36'
    else
      config.lighthouseOptions.emulatedUserAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
  }

  if (userConfig.extraHeaders)
    config.lighthouseOptions.extraHeaders = userConfig.extraHeaders

  if (config.routerPrefix)
    config.routerPrefix = withSlashes(config.routerPrefix)

  config.puppeteerOptions = defu(config.puppeteerOptions, {
    // try avoid timeouts
    timeout: 0,
    protocolTimeout: 0,
  })
  config.puppeteerClusterOptions = defu(config.puppeteerClusterOptions, {
    timeout: 120_000,
  })
  config.puppeteerOptions = defu(config.puppeteerOptions, {
    // set viewport
    headless: true,
    ignoreHTTPSErrors: true,
  })
  config.puppeteerOptions.defaultViewport = config.lighthouseOptions.screenEmulation as any

  // Auto-add --no-sandbox when running as root (e.g. Docker, VPS)
  if (process.getuid?.() === 0) {
    config.puppeteerOptions.args = config.puppeteerOptions.args || []
    if (!config.puppeteerOptions.args.includes('--no-sandbox'))
      config.puppeteerOptions.args.push('--no-sandbox')
    if (!config.puppeteerOptions.args.includes('--disable-setuid-sandbox'))
      config.puppeteerOptions.args.push('--disable-setuid-sandbox')
  }

  let foundChrome = !!config.puppeteerOptions?.executablePath
  // if user is using the default chrome binary options
  if (config.chrome.useSystem && !foundChrome) {
    // we'll try and resolve their local chrome
    let chromePath: string | false = false
    try {
      chromePath = Launcher.getFirstInstallation() || false
    }
    catch (e) {
      logger.debug('Chrome launcher failed to get a path.', e)
    }
    if (chromePath) {
      logger.info(`Using system Chrome located at: \`${chromePath}\`.`)
      // set default to puppeteer core
      config.puppeteerClusterOptions.puppeteer = puppeteer
      // point to our pre-installed chrome version
      config.puppeteerOptions.executablePath = chromePath
      foundChrome = true
    }
  }
  if (foundChrome) {
    logger.debug('Testing system Chrome installation.')
    // mock the behavior of the custer so we can handle errors better
    const instance = await launch(config.puppeteerOptions).catch((e) => {
      logger.warn(`Failed to launch puppeteer instance using \`${config.puppeteerOptions?.executablePath}\`.`, e)
      foundChrome = false
    })
    // let the cluster do the work
    if (instance) {
      await instance.close()
    }
  }
  if (!foundChrome) {
    // if we can't find their local chrome, we just need to make sure they have puppeteer, this is a similar check
    // puppeteer-cluster will do, but we can provide a nicer error
    try {
      await resolveModule('puppeteer')
      foundChrome = true
      logger.info('Using puppeteer dependency for Chrome.')
    }
    catch (e) {
      logger.debug('Puppeteer does not exist as a dependency.', e)
    }
  }
  if (config.chrome.useDownloadFallback && !foundChrome) {
    const browserOptions = {
      installDeps: process.getuid?.() === 0,
      cacheDir: config.chrome.downloadFallbackCacheDir,
      buildId: config.chrome.downloadFallbackVersion || PUPPETEER_REVISIONS.chrome,
      browser: 'chrome',
    } as InstallOptions

    const chromePath = computeExecutablePath(browserOptions)
    if (!existsSync(chromePath)) {
      logger.info(`Missing ${browserOptions.browser} binary, downloading v${browserOptions.buildId}...`)
      let lastPercent = 0
      // @ts-expect-error untyped
      await install({
        ...browserOptions,
        downloadProgressCallback: (downloadedBytes, toDownloadBytes) => {
          const percent = Math.round(downloadedBytes / toDownloadBytes * 100)
          if (percent % 5 === 0 && lastPercent !== percent) {
            logger.info(`Downloading ${browserOptions.browser}: ${percent}%`)
            lastPercent = percent
          }
        },
      })
    }
    logger.info(`Using downloaded ${browserOptions.browser} v${browserOptions.buildId} located at: ${chromePath}`)
    config.puppeteerOptions.executablePath = chromePath
    foundChrome = true
  }
  if (!foundChrome)
    throw new Error('Failed to find chrome. Please ensure you have a valid chrome installed.')

  // mock the behavior of the custer so we can handle errors better
  const instance = await launch(config.puppeteerOptions).catch((e) => {
    if (detectBrowserPlatform() === 'linux' && e.toString().includes('error while loading shared libraries')) {
      const depsPath = path.join(
        path.dirname(config.puppeteerOptions!.executablePath!),
        'deb.deps',
      )
      if (existsSync(depsPath)) {
        const data = readFileSync(depsPath, 'utf-8').trim().split('\n').map(d => `"${d}"`).join(',')
        logger.warn('Failed to start puppeteer, you may be missing dependencies.')
        logger.log('')
        const command = [
          'sudo',
          'apt-get',
          'satisfy',
          '-y',
          data,
          '--no-install-recommends',
        ].join(' ')
        // eslint-disable-next-line no-console
        console.log(`\x1B[96m%s\x1B[0m`, `Run the following command:\n${command}`)
        logger.log('')
      }
    }
    throw e
  })
  // let the cluster do the work
  if (instance) {
    await instance.close()
  }

  // resolve the output path
  config.outputPath = resolve(config.root!, config.outputPath!)
  return config as ResolvedUserConfig
}
