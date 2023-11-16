import type { Page } from 'puppeteer-core'
import { useUnlighthouse } from '../unlighthouse'

export async function setupPage(page: Page) {
  const { resolvedConfig, hooks } = useUnlighthouse()

  const browser = page.browser()
  // ignore csp errors
  await page.setBypassCSP(true)

  if (resolvedConfig.auth)
    await page.authenticate(resolvedConfig.auth)

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
  if (resolvedConfig.cookies)
    await page.setCookie(...resolvedConfig.cookies.map(cookie => ({ domain: resolvedConfig.site, ...cookie })))
  if (resolvedConfig.extraHeaders)
    await page.setExtraHTTPHeaders(resolvedConfig.extraHeaders)

  // Wait for Lighthouse to open url, then allow hook to run
  browser.on('targetchanged', async (target) => {
    const page = await target.page()
    if (page) {
      // in case they get reset
      if (resolvedConfig.cookies)
        await page.setCookie(...resolvedConfig.cookies.map(cookie => ({ domain: resolvedConfig.site, ...cookie })))
      // set local storage
      if (resolvedConfig.extraHeaders)
        await page.setExtraHTTPHeaders(resolvedConfig.extraHeaders)
      await hooks.callHook('puppeteer:before-goto', page)
    }
  })
}
