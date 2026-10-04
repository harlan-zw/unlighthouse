import type { Logger } from '@unlighthouse/contracts'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { LocalAuditorOptions } from '@unlighthouse/core/auditors/local'
import { randomUUID } from 'node:crypto'
import { existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { Launcher } from 'chrome-launcher'
import { downloadAuditRuntime } from './compact-runtime'
import { prepareRuntimeCache, runtimeCacheDirectory, withRuntimeDownloadLock } from './runtime-download'

export function createLighthouseLoader(options: {
  logger?: Logger
  env?: NodeJS.ProcessEnv
  chrome?: UnlighthouseConfig['chrome']
  local?: boolean
} = {}): NonNullable<LocalAuditorOptions['loadRuntime']> {
  let pending: ReturnType<NonNullable<LocalAuditorOptions['loadRuntime']>> | undefined
  const load = async (signal?: AbortSignal) => {
    const resolve = await downloadAuditRuntime({ ...options, signal })
    const runtime = { lighthouse: resolve('lighthouse'), puppeteer: resolve('puppeteer-core') }
    if (!options.local)
      return runtime
    const env = { ...process.env, ...options.env }
    if (env.CHROME_PATH && existsSync(env.CHROME_PATH))
      return { ...runtime, chromePath: env.CHROME_PATH }
    if (options.chrome?.useSystem !== false) {
      const installed = Launcher.getInstallations()[0]
      if (installed)
        return { ...runtime, chromePath: installed }
    }
    if (options.chrome?.useDownloadFallback === false)
      throw new Error('Chrome was not found. Enable chrome.useDownloadFallback or set CHROME_PATH.')
    const browserCache = options.chrome?.downloadFallbackCacheDir ?? runtimeCacheDirectory(env)
    await prepareRuntimeCache(browserCache)
    const browsers = await import(resolve('@puppeteer/browsers')) as typeof import('@puppeteer/browsers')
    const { PUPPETEER_REVISIONS } = await import(resolve('puppeteer-core/internal/revisions.js')) as typeof import('puppeteer-core/internal/revisions.js')
    const browserOptions = {
      browser: browsers.Browser.CHROME,
      buildId: String(options.chrome?.downloadFallbackVersion ?? PUPPETEER_REVISIONS.chrome),
      cacheDir: browserCache,
      unpack: true as const,
      platform: browsers.detectBrowserPlatform(),
    }
    if (!browserOptions.platform)
      throw new Error('Chrome downloads do not support this platform. Set CHROME_PATH to a compatible browser.')
    const executablePath = browsers.computeExecutablePath(browserOptions)
    if (!existsSync(executablePath)) {
      await withRuntimeDownloadLock(join(browserOptions.cacheDir, 'chrome-download.lock'), async () => {
        if (!existsSync(executablePath)) {
          options.logger?.info?.(`Downloading Chrome ${browserOptions.buildId}`)
          const staging = join(browserOptions.cacheDir, `.chrome-download-${randomUUID()}.tmp`)
          try {
            const installed = await browsers.install({ ...browserOptions, cacheDir: staging })
            signal?.throwIfAborted()
            const destination = new browsers.Cache(browserOptions.cacheDir).installationDir(browserOptions.browser, browserOptions.platform!, browserOptions.buildId)
            await mkdir(dirname(destination), { recursive: true })
            // A prior interrupted legacy install can leave an incomplete version directory.
            await rm(destination, { recursive: true, force: true })
            await rename(installed.path, destination)
          }
          finally {
            await rm(staging, { recursive: true, force: true })
          }
        }
      }, signal)
    }
    signal?.throwIfAborted()
    return { ...runtime, chromePath: executablePath }
  }
  return signal => pending ??= load(signal).catch((error) => {
    pending = undefined
    throw error
  })
}
