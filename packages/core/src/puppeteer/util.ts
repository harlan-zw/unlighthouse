import type { Page } from '../types/puppeteer'
import { useLogger, useUnlighthouse } from '../unlighthouse'
import { resolveRequestHeaders, toBrowserCookies } from '../util/requestHeaders'

export async function setupPage(page: Page) {
  const { resolvedConfig, hooks } = useUnlighthouse()
  const logger = useLogger()
  const softErrorHandler = (ctx: string) => (err: Error) => {
    logger.error(ctx, err)
  }
  const browser = page.browser()
  // ignore csp errors
  await page.setBypassCSP(true)

  if (resolvedConfig.auth)
    await page.authenticate(resolvedConfig.auth).catch(softErrorHandler('Failed to authenticate'))

  // set local storage
  if (resolvedConfig.localStorage) {
    await page.evaluateOnNewDocument(
      (data) => {
        localStorage.clear()
        for (const key in data)
          localStorage.setItem(key, data[key])
      },
      resolvedConfig.localStorage,
    )
  }
  // set session storage
  if (resolvedConfig.sessionStorage) {
    await page.evaluateOnNewDocument(
      (data) => {
        sessionStorage.clear()
        for (const key in data)
          sessionStorage.setItem(key, data[key])
      },
      resolvedConfig.sessionStorage,
    )
  }
  // headers apply to every request the page makes, so cookies go to the cookie jar, which scopes them by domain and path
  const requestHeaders = resolveRequestHeaders(resolvedConfig)
  const cookies = toBrowserCookies(resolvedConfig.cookies, resolvedConfig.site)
  if (cookies.length) {
    await page.setCookie(...cookies)
      .catch(softErrorHandler('Failed to set cookies'))
    // Lighthouse opens its page in the default browser context, which does not share this page's cookie jar.
    // CDP takes the same `url` scoping as the page, so a cookie without a domain stays host only.
    const session = await browser.target().createCDPSession()
    await session.send('Storage.setCookies', { cookies })
      .catch(softErrorHandler('Failed to set cookies'))
    await session.detach().catch(softErrorHandler('Failed to detach the cookie session'))
  }
  if (Object.keys(requestHeaders).length) {
    await page.setExtraHTTPHeaders(requestHeaders)
      .catch(softErrorHandler('Failed to set extra headers'))
  }

  // Wait for Lighthouse to open url, then allow hook to run
  browser.on('targetchanged', async (target) => {
    const page = await target.page()
    if (page) {
      // in case they get reset
      if (cookies.length) {
        await page.setCookie(...cookies)
          .catch(softErrorHandler('Failed to set cookies'))
      }
      if (Object.keys(requestHeaders).length) {
        await page.setExtraHTTPHeaders(requestHeaders)
          .catch(softErrorHandler('Failed to set extra headers'))
      }
      if (resolvedConfig.userAgent) {
        await page.setUserAgent(resolvedConfig.userAgent)
      }
      await hooks.callHook('puppeteer:before-goto', page)
    }
  })
}
