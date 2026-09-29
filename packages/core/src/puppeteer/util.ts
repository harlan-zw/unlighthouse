import type { Page } from '../types/puppeteer'
import { useLogger, useUnlighthouse } from '../unlighthouse'
import { resolveRequestHeaders } from '../util/requestHeaders'

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
  // cookies go as a header, since a cookie jar entry does not survive the Lighthouse storage reset
  const requestHeaders = resolveRequestHeaders(resolvedConfig)
  if (Object.keys(requestHeaders).length) {
    await page.setExtraHTTPHeaders(requestHeaders)
      .catch(softErrorHandler('Failed to set extra headers'))
  }

  // Wait for Lighthouse to open url, then allow hook to run
  browser.on('targetchanged', async (target) => {
    const page = await target.page()
    if (page) {
      // in case they get reset
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
