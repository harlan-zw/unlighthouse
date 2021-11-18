import fs from 'fs-extra'
import cheerio, { CheerioAPI } from 'cheerio'
import { Page } from 'puppeteer'
import { PuppeteerTask } from '@shared'
import {useLogger} from "../../core";

const logger = useLogger()

export const extractHtmlPayload: (page: Page, route: string) => Promise<string|false> = async(page, route) => {
  // get page html content
  try {
    const pageVisit = await page.goto(route, {waitUntil: 'domcontentloaded'})
    return await pageVisit.text()
  } catch (e) {
    logger.warn(`Failed to load page ${route}.`, e)
    return false
  }
}

export const processSeoMeta = ($: CheerioAPI) => {
  return {
    icon: $('link[rel="icon"]').attr('href'),
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
  const { routeReport, options } = data

  let html: string

  // basic caching based on saving html payloads
  if (fs.existsSync(routeReport.htmlPayload)) {
    html = fs.readFileSync(routeReport.htmlPayload, { encoding: 'utf-8' })
  }
  else {
    const payload = await extractHtmlPayload(page, routeReport.route.url)
    if (payload === false) {
      return routeReport
    }
    html = payload
    fs.writeFileSync(routeReport.htmlPayload, html)
  }

  const $ = cheerio.load(html)
  routeReport.seo = processSeoMeta($)
  const internalLinks: string[] = []
  $(`a[href^='/'], a[href^='${options.host}']`).each(function () {
    internalLinks.push($(this).attr('href') as string)
  })
  routeReport.internalLinks = internalLinks
  routeReport.seo.internalLinks = internalLinks.length
  console.log(routeReport.route.url, routeReport.seo?.internalLinks)
  return routeReport
}
