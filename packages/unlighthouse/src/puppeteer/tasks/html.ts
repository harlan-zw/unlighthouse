import fs from 'fs-extra'
import cheerio, { CheerioAPI } from 'cheerio'
import { Page } from 'puppeteer'
import { PuppeteerTask } from '@shared'

export const extractHtmlPayload: (page: Page, route: string) => Promise<string> = async(page, route) => {
  // get page html content
  const pageVisit = await page.goto(route, { waitUntil: 'domcontentloaded' })
  return await pageVisit.text()
}

export const processSeoMeta = ($: CheerioAPI) => {
  return {
    title: $('meta[name=\'title\'], head > title').text(),
    description: $('meta[name=\'description\']').attr('content'),
    og: {
      image: $('meta[property=\'og:image\'], meta[name=\'og:image\']').attr('content'),
      description: $('meta[property=\'og:description\'], meta[name=\'og:description\']').attr('content'),
      title: $('meta[property=\'og:title\'], meta[name=\'og:title\']').attr('content'),
    },
  }
}

export const inspectHtmlTask: PuppeteerTask = async(props) => {
  const { page, data } = props
  const { routeReport } = data

  let html: string

  // basic caching based on saving html payloads
  if (fs.existsSync(routeReport.htmlPayload)) {
    html = fs.readFileSync(routeReport.htmlPayload, { encoding: 'utf-8' })
  }
  else {
    html = await extractHtmlPayload(page, routeReport.route.url)
    fs.writeFileSync(routeReport.htmlPayload, html)
  }

  const $ = cheerio.load(html)
  routeReport.seo = processSeoMeta($)
  return routeReport
}
