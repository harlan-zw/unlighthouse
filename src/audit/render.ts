import puppeteer from 'puppeteer-core'
import type { Browser } from 'puppeteer-core'
import type { AuthState, FetchedPage, Renderer } from '../contracts.ts'
import { injectAuth } from './auth.ts'
import type { ChromeProcess } from './chrome.ts'
import { findChrome, launchChrome } from './chrome.ts'

export interface RendererOptions {
  chromePath?: string
  chromeFlags?: string[]
  userAgent?: string
  auth?: AuthState
  timeoutMs?: number
  idleMs?: number
  maxIdleWaitMs?: number
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('The page load was aborted', 'AbortError')
}

export function createRenderer(options: RendererOptions = {}): Renderer {
  const timeoutMs = options.timeoutMs ?? 30_000
  const idleMs = options.idleMs ?? 500
  const maxIdleWaitMs = options.maxIdleWaitMs ?? 5_000
  let started: Promise<{ chrome: ChromeProcess, browser: Browser }> | null = null
  let closed = false

  function start() {
    started ??= (async () => {
      const chrome = await launchChrome({ chromePath: findChrome(options.chromePath), flags: options.chromeFlags ?? [] })
      try {
        const browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null })
        return { chrome, browser }
      }
      catch (error) {
        await chrome.kill()
        throw error
      }
    })()
    return started
  }

  async function fetchPage(url: string, signal?: AbortSignal): Promise<FetchedPage> {
    if (closed)
      throw new Error('The renderer is closed')
    if (signal?.aborted)
      throw abortError(signal)
    const { browser } = await start()
    const page = await browser.newPage()
    const onAbort = () => {
      page.close().catch(() => {})
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    try {
      if (options.userAgent)
        await page.setUserAgent({ userAgent: options.userAgent })
      if (options.auth)
        await injectAuth(browser, page, options.auth, url)
      const response = await page.goto(url, { waitUntil: 'load', timeout: timeoutMs })
      await page.waitForNetworkIdle({ idleTime: idleMs, timeout: maxIdleWaitMs }).catch(() => {})
      const headers = response?.headers() ?? {}
      const contentType = headers['content-type'] ?? null
      const isHtml = contentType === null || /html|xml/i.test(contentType)
      return {
        url,
        finalUrl: page.url(),
        status: response?.status() ?? 0,
        contentType,
        html: isHtml ? await page.content() : null,
      }
    }
    catch (error) {
      if (signal?.aborted)
        throw abortError(signal)
      throw error
    }
    finally {
      signal?.removeEventListener('abort', onAbort)
      await page.close().catch(() => {})
    }
  }

  async function close(): Promise<void> {
    closed = true
    if (!started)
      return
    const running = await started.catch(() => null)
    if (!running)
      return
    await running.browser.disconnect().catch(() => {})
    await running.chrome.kill()
  }

  return { fetchPage, close }
}
