/**
 * Lighthouse audit worker — runs inside core's audit-pool worker thread.
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
import { launch } from 'chrome-launcher'
import lighthouse from 'lighthouse'
import puppeteer from 'puppeteer-core'
import { createWorkerHandler, defineTask } from './audit-pool/worker'
import { extractInsights } from './extract'
import { getScreenEmulation, getUserAgent, resolveLighthouseConfig } from './lighthouse-config'
import { buildIndexedDbInjectionScript, buildStorageInjectionScript } from './storage-injection'

export interface LighthousePayload {
  url: string
  options?: UnlighthouseOptions
}

// Chrome leak guard. chrome-launcher spawns Chrome as a child of this worker
// thread's process; when the pool recycles or terminates a worker mid-audit the
// `finally` that calls `chrome.kill()` may never run, leaving an orphaned
// headless Chrome (re-parented to init, holding its debugging port) for every
// recycle. Track live PIDs and hard-kill them synchronously on any process exit
// path so a dying worker takes its Chrome with it.
const liveChromePids = new Set<number>()
function killAllChrome() {
  for (const pid of liveChromePids) {
    try {
      process.kill(pid, 'SIGKILL')
    }
    catch {}
  }
  liveChromePids.clear()
}
let cleanupBound = false
function bindChromeCleanup() {
  if (cleanupBound)
    return
  cleanupBound = true
  // `exit` fires when the worker thread is torn down (pool destroy, recycle,
  // idle-timeout, or the host process dying) — that's the path that was leaking
  // Chrome. Signal handlers are intentionally NOT registered here: in a
  // worker_thread they don't receive process signals, and calling process.exit
  // from a worker would take down the whole host.
  process.once('exit', killAllChrome)
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
    // Register for the worker-death cleanup before doing any (long) audit work.
    bindChromeCleanup()
    if (typeof chrome.pid === 'number')
      liveChromePids.add(chrome.pid)
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

  // Push the form-factor emulation into the flags too, not just `config`.
  // Lighthouse flags take precedence over config.settings, and passing the
  // device only via config let the default mobile emulation win — so a desktop
  // audit silently ran (and screenshotted) at the mobile 412px viewport.
  const formFactor = options.emulatedFormFactor || 'mobile'
  const flags = {
    output: 'json' as const,
    logLevel: options.logLevel || 'error',
    ...options.lighthouseFlags,
    // After spreading caller flags so the device emulation always wins (the
    // whole point — otherwise a stray default formFactor would override it).
    formFactor,
    screenEmulation: getScreenEmulation(formFactor),
    emulatedUserAgent: getUserAgent(formFactor),
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
    if (chrome) {
      const pid = chrome.pid
      // chrome-launcher's kill() isn't reliably a Promise across versions, so
      // wrap before awaiting to avoid a `.catch of undefined` crash.
      await Promise.resolve(chrome.kill()).catch(() => {})
      if (typeof pid === 'number')
        liveChromePids.delete(pid)
    }
  }
})

export default createWorkerHandler({
  tasks: { lighthouse: lighthouseTask },
})
