import type { InstallOptions } from '@puppeteer/browsers'
import type { Logger } from '@unlighthouse/contracts'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { computeExecutablePath, install } from '@puppeteer/browsers'
import { detectBrowserPlatform } from '@puppeteer/browsers'
import { Launcher } from 'chrome-launcher'
import { resolve as resolveModule } from 'mlly'
import { launch } from 'puppeteer-core'
import { PUPPETEER_REVISIONS } from 'puppeteer-core/lib/cjs/puppeteer/revisions.js'

export interface ChromeConfig {
  useSystem?: boolean
  useDownloadFallback?: boolean
  downloadFallbackCacheDir?: string
  downloadFallbackVersion?: string | number
}

export interface ResolveChromeDeps {
  chrome: ChromeConfig
  puppeteerOptions: Record<string, any>
  logger?: Logger
}

export async function resolveChrome({ chrome, puppeteerOptions, logger }: ResolveChromeDeps): Promise<void> {
  let foundChrome = !!puppeteerOptions.executablePath

  if (chrome.useSystem && !foundChrome) {
    let chromePath: string | false = false
    try {
      chromePath = Launcher.getFirstInstallation() || false
    }
    catch (e) {
      logger?.debug?.('Chrome launcher failed to get a path.', e)
    }
    if (chromePath) {
      logger?.info?.(`Using system Chrome located at: \`${chromePath}\`.`)
      puppeteerOptions.executablePath = chromePath
      foundChrome = true
    }
  }

  if (foundChrome) {
    logger?.debug?.('Testing system Chrome installation.')
    const instance = await launch(puppeteerOptions).catch((e) => {
      logger?.warn?.(`Failed to launch puppeteer instance using \`${puppeteerOptions.executablePath}\`.`, e)
      foundChrome = false
    })
    if (instance)
      await instance.close()
  }

  if (!foundChrome) {
    try {
      await resolveModule('puppeteer')
      foundChrome = true
      logger?.info?.('Using puppeteer dependency for Chrome.')
    }
    catch (e) {
      logger?.debug?.('Puppeteer does not exist as a dependency.', e)
    }
  }

  if (chrome.useDownloadFallback && !foundChrome) {
    const browserOptions = {
      installDeps: process.getuid?.() === 0,
      cacheDir: chrome.downloadFallbackCacheDir,
      buildId: String(chrome.downloadFallbackVersion || PUPPETEER_REVISIONS.chrome),
      browser: 'chrome',
    } as InstallOptions

    const chromePath = computeExecutablePath(browserOptions)
    if (!existsSync(chromePath)) {
      logger?.info?.(`Missing ${browserOptions.browser} binary, downloading v${browserOptions.buildId}...`)
      let lastPercent = 0
      // @ts-expect-error untyped
      await install({
        ...browserOptions,
        downloadProgressCallback: (downloadedBytes: number, toDownloadBytes: number) => {
          const percent = Math.round(downloadedBytes / toDownloadBytes * 100)
          if (percent % 5 === 0 && lastPercent !== percent) {
            logger?.info?.(`Downloading ${browserOptions.browser}: ${percent}%`)
            lastPercent = percent
          }
        },
      })
    }
    logger?.info?.(`Using downloaded ${browserOptions.browser} v${browserOptions.buildId} located at: ${chromePath}`)
    puppeteerOptions.executablePath = chromePath
    foundChrome = true
  }

  if (!foundChrome)
    throw new Error('Failed to find chrome. Please ensure you have a valid chrome installed.')

  const instance = await launch(puppeteerOptions).catch((e) => {
    if (detectBrowserPlatform() === 'linux' && e.toString().includes('error while loading shared libraries')) {
      const depsPath = path.join(
        path.dirname(puppeteerOptions.executablePath!),
        'deb.deps',
      )
      if (existsSync(depsPath)) {
        const data = readFileSync(depsPath, 'utf-8').trim().split('\n').map(d => `"${d}"`).join(',')
        logger?.warn?.('Failed to start puppeteer, you may be missing dependencies.')
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
      }
    }
    throw e
  })
  if (instance)
    await instance.close()
}
