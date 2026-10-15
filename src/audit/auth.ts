import { isAbsolute, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import puppeteer from 'puppeteer-core'
import type { Browser, Page } from 'puppeteer-core'
import type { Config } from '../config.ts'
import type { AuthState, Cookie } from '../contracts.ts'
import { UnlighthouseError } from '../errors.ts'
import { findChrome, launchChrome } from './chrome.ts'

export function staticAuth(config: Config): AuthState {
  return {
    headers: { ...config.auth.headers },
    cookies: config.auth.cookies.map(({ name, value, domain, path }) => ({
      name,
      value,
      ...(domain ? { domain } : {}),
      ...(path ? { path } : {}),
    })),
    localStorage: { ...config.auth.localStorage },
    sessionStorage: { ...config.auth.sessionStorage },
  }
}

function siteHosts(hostname: string): string[] {
  const apex = hostname.startsWith('www.') ? hostname.slice(4) : hostname
  return [apex, `www.${apex}`]
}

async function scopeHeaders(page: Page, headers: Record<string, string>, target: URL): Promise<void> {
  if (!Object.keys(headers).length)
    return
  const hosts = siteHosts(target.hostname)
  const extra = new Map(Object.entries(headers).map(([name, value]) => [name.toLowerCase(), { name, value }]))
  const session = await page.createCDPSession()
  session.on('Fetch.requestPaused', (event) => {
    let own = false
    try {
      const url = new URL(event.request.url)
      own = hosts.includes(url.hostname) && url.port === target.port
    }
    catch {}
    const merged = own
      ? [
          ...Object.entries(event.request.headers).filter(([name]) => !extra.has(name.toLowerCase())).map(([name, value]) => ({ name, value })),
          ...extra.values(),
        ]
      : null
    session.send('Fetch.continueRequest', { requestId: event.requestId, ...(merged ? { headers: merged } : {}) }).catch(() => {})
  })
  const port = target.port ? `:${target.port}` : ''
  await session.send('Fetch.enable', {
    patterns: hosts.flatMap(host => ['http', 'https'].map(scheme => ({ urlPattern: `${scheme}://${host}${port}/*`, requestStage: 'Request' as const }))),
  })
}

export async function injectAuth(browser: Browser, page: Page, auth: AuthState, targetUrl: string): Promise<void> {
  const target = new URL(targetUrl)
  await scopeHeaders(page, auth.headers, target)
  if (auth.cookies.length) {
    await browser.setCookie(...auth.cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain ?? target.hostname,
      path: cookie.path ?? '/',
    })))
  }
  if (Object.keys(auth.localStorage).length || Object.keys(auth.sessionStorage).length) {
    await page.evaluateOnNewDocument((origin: string, local: Record<string, string>, session: Record<string, string>) => {
      if (location.origin !== origin)
        return
      try {
        for (const [key, value] of Object.entries(local))
          localStorage.setItem(key, value)
        for (const [key, value] of Object.entries(session))
          sessionStorage.setItem(key, value)
      }
      catch {}
    }, target.origin, auth.localStorage, auth.sessionStorage)
  }
}

type LoginScript = (page: Page, context: { site: string | undefined, config: Config }) => unknown

function mergeCookies(base: Cookie[], captured: Cookie[]): Cookie[] {
  const id = (cookie: Cookie) => `${cookie.name}\u0000${cookie.domain ?? ''}\u0000${cookie.path ?? '/'}`
  const merged = new Map(base.map(cookie => [id(cookie), cookie]))
  for (const cookie of captured)
    merged.set(id(cookie), cookie)
  return [...merged.values()]
}

export async function captureLogin(config: Config, cwd = process.cwd(), signal?: AbortSignal): Promise<AuthState> {
  const auth = staticAuth(config)
  const login = config.auth.login
  if (!login)
    return auth

  const modulePath = isAbsolute(login) ? login : resolve(cwd, login)
  let script: LoginScript
  try {
    const mod = await import(pathToFileURL(modulePath).href) as { default?: unknown }
    if (typeof mod.default !== 'function')
      throw new Error('its default export is not a function')
    script = mod.default as LoginScript
  }
  catch (error) {
    throw new UnlighthouseError('INVALID_CONFIG', `Cannot load the login script ${modulePath}: ${error instanceof Error ? error.message : String(error)}`)
  }

  signal?.throwIfAborted()
  const chrome = await launchChrome({ chromePath: findChrome(config.chromePath), flags: config.chromeFlags })
  const stop = () => {
    chrome.kill().catch(() => {})
  }
  signal?.addEventListener('abort', stop, { once: true })
  if (signal?.aborted)
    stop()
  let browser: Browser | undefined
  try {
    browser = await puppeteer.connect({ browserURL: `http://127.0.0.1:${chrome.port}`, defaultViewport: null })
    const page = await browser.newPage()
    if (config.userAgent)
      await page.setUserAgent({ userAgent: config.userAgent })
    if (config.site)
      await injectAuth(browser, page, auth, config.site)
    try {
      await script(page, { site: config.site, config })
    }
    catch (error) {
      throw new UnlighthouseError('AUDIT_FAILED', `The login script ${modulePath} failed: ${error instanceof Error ? error.message : String(error)}`)
    }

    const captured = await browser.cookies()
    auth.cookies = mergeCookies(auth.cookies, captured.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
    })))

    const origin = config.site ? new URL(config.site).origin : new URL(page.url()).origin
    if (!origin.startsWith('http'))
      return auth
    if (new URL(page.url()).origin !== origin)
      await page.goto(origin, { waitUntil: 'domcontentloaded' })
    const storage = await page.evaluate(() => {
      const read = (store: Storage) => {
        const out: Record<string, string> = {}
        for (let i = 0; i < store.length; i++) {
          const key = store.key(i)
          if (key !== null)
            out[key] = store.getItem(key) ?? ''
        }
        return out
      }
      return { local: read(localStorage), session: read(sessionStorage) }
    })
    auth.localStorage = { ...auth.localStorage, ...storage.local }
    auth.sessionStorage = { ...auth.sessionStorage, ...storage.session }
    return auth
  }
  finally {
    signal?.removeEventListener('abort', stop)
    await browser?.disconnect().catch(() => {})
    await chrome.kill()
  }
}
