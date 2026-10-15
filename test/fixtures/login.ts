import type { Page } from 'puppeteer-core'

export default async function login(page: Page, { site }: { site: string | undefined }) {
  await page.goto(`${site}/login`)
  await page.type('input[name=user]', 'demo')
  await Promise.all([page.waitForNavigation(), page.click('button')])
  await page.evaluate(() => {
    localStorage.setItem('token', 'from-login')
    sessionStorage.setItem('tab', 'login-tab')
  })
}
