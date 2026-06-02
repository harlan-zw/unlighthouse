/**
 * Lighthouse audit worker — runs inside an @unlighthouse/audit-pool worker thread.
 *
 * Each worker thread has its own lighthouse module instance, which isolates the global
 * `performance.mark` state that lighthouse-logger/marky uses for timing. That isolation is
 * the whole reason this path goes through a pool: concurrent in-process `lighthouse()` calls
 * collide on those marks and surface as "performance mark has not been set" errors.
 *
 * The worker is `bare: true` — it spawns its own Chrome via chrome-launcher; the pool does
 * NOT pre-launch puppeteer here.
 */
import type { UnlighthouseOptions, UnlighthouseReport } from '@unlighthouse/contracts'
import { createWorkerHandler, defineTask } from '@unlighthouse/audit-pool/worker'
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'
import puppeteer from 'puppeteer-core'
import { extractInsights } from './extract'
import { resolveLighthouseConfig } from './lighthouse-config'
import { buildIndexedDbInjectionScript, buildStorageInjectionScript } from './storage-injection'

export interface LighthousePayload {
  url: string
  options?: UnlighthouseOptions
}

const lighthouseTask = defineTask<LighthousePayload, UnlighthouseReport>(async (_ctx, { url, options = {} }) => {
  let chrome
  let port = options.port || (options.lighthouseFlags?.port as number)

  if (!port) {
    // CHROME_FLAGS env (space-separated) — lets local dev pass --no-sandbox
    // without running as root (Ubuntu 23.10+ AppArmor blocks unprivileged
    // user namespaces, Chrome dies on launch otherwise).
    const envFlags = (process.env.CHROME_FLAGS || '').split(/\s+/).filter(Boolean)
    chrome = await launch({
      chromeFlags: ['--headless', ...envFlags, ...(options.launchOptions?.chromeFlags || [])],
      ...options.launchOptions,
    })
    port = chrome.port
  }

  const config = options.lighthouseConfig || resolveLighthouseConfig(options)

  // #292: seed web storage before the page's own scripts run, for token/session-gated
  // sites. Needs a puppeteer page (init script + navigation mode); without storage we
  // keep the lighter port-only path so the default scan is unchanged.
  const storageScript = [
    buildStorageInjectionScript({
      localStorage: options.localStorage,
      sessionStorage: options.sessionStorage,
    }),
    buildIndexedDbInjectionScript(options.indexedDb as never),
  ].filter(Boolean).join('\n')

  const flags = {
    output: 'json' as const,
    logLevel: options.logLevel || 'error',
    ...options.lighthouseFlags,
  }

  let browser: Awaited<ReturnType<typeof puppeteer.connect>> | undefined
  try {
    let result
    if (storageScript) {
      browser = await puppeteer.connect({ browserURL: `http://localhost:${port}` })
      const page = await browser.newPage()
      await page.evaluateOnNewDocument(storageScript)
      result = await lighthouse(url, flags, config, page)
    }
    else {
      result = await lighthouse(url, { ...flags, port }, config)
    }

    if (!result || !result.lhr)
      throw new Error('Lighthouse failed to run')

    return {
      url: result.lhr.requestedUrl || result.lhr.finalUrl || result.lhr.finalDisplayedUrl,
      fetchTime: result.lhr.fetchTime,
      insights: extractInsights(result.lhr),
      raw: result.lhr,
      // `artifacts` carries non-serializable handles (e.g. Buffers wrapped via Devtools APIs).
      // Drop it for the worker boundary; consumers only need `raw`/`insights`.
      artifacts: undefined,
    }
  }
  finally {
    if (browser)
      browser.disconnect()
    if (chrome)
      await chrome.kill()
  }
})

export default createWorkerHandler({
  tasks: { lighthouse: lighthouseTask },
})
