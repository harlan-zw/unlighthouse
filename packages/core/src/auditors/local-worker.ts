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
import { extractInsights } from './extract'
import { resolveLighthouseConfig } from './lighthouse-config'

export interface LighthousePayload {
  url: string
  options?: UnlighthouseOptions
}

const lighthouseTask = defineTask<LighthousePayload, UnlighthouseReport>(async (_ctx, { url, options = {} }) => {
  let chrome
  let port = options.port || (options.lighthouseFlags?.port as number)

  if (!port) {
    chrome = await launch({
      chromeFlags: ['--headless', ...(options.launchOptions?.chromeFlags || [])],
      ...options.launchOptions,
    })
    port = chrome.port
  }

  const config = options.lighthouseConfig || resolveLighthouseConfig(options)

  try {
    const result = await lighthouse(url, {
      port,
      output: 'json',
      logLevel: options.logLevel || 'error',
      ...options.lighthouseFlags,
    }, config)

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
    if (chrome)
      await chrome.kill()
  }
})

export default createWorkerHandler({
  tasks: { lighthouse: lighthouseTask },
})
