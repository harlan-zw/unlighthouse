import type { Page } from 'puppeteer-core'
import { useLogger, useUnlighthouse } from '../unlighthouse'

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
  if (resolvedConfig.cookies) {
    await page.setCookie(...resolvedConfig.cookies.map(cookie => ({ domain: resolvedConfig.site, ...cookie })))
      .catch(softErrorHandler('Failed to set cookies'))
  }
  if (resolvedConfig.extraHeaders) {
    await page.setExtraHTTPHeaders(resolvedConfig.extraHeaders)
      .catch(softErrorHandler('Failed to set extra headers'))
  }

  // Wait for Lighthouse to open url, then allow hook to run
  browser.on('targetchanged', async (target) => {
    const page = await target.page()
    if (page) {
      // in case they get reset
      if (resolvedConfig.cookies) {
        await page.setCookie(...resolvedConfig.cookies.map(cookie => ({ domain: resolvedConfig.site, ...cookie })))
          .catch(softErrorHandler('Failed to set cookies'))
      }
      // set local storage
      if (resolvedConfig.extraHeaders) {
        await page.setExtraHTTPHeaders(resolvedConfig.extraHeaders)
          .catch(softErrorHandler('Failed to set extra headers'))
      }
      await hooks.callHook('puppeteer:before-goto', page)
    }
  })
}
