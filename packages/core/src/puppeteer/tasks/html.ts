import fs from 'fs-extra'
import type { CheerioAPI } from 'cheerio'
import cheerio from 'cheerio'
import type { Page } from 'puppeteer-core'
import type { PuppeteerTask } from '../../types'
import { useUnlighthouse } from '../../unlighthouse'
import { useLogger } from '../../logger'
import { fetchUrlRaw, formatBytes, trimSlashes } from '../../util'
import { normaliseRoute } from '../../router'

export const extractHtmlPayload: (page: Page, route: string) => Promise<{ success: boolean; redirected?: false|string; message?: string; payload?: string }> = async(page, route) => {
  const { worker, resolvedConfig } = useUnlighthouse()

  // if we don't need to execute any javascript we can do a less expensive fetch of the URL
  if (resolvedConfig.scanner.skipJavascript) {
    const { valid, response, redirected } = await fetchUrlRaw(route)
    if (!valid || !response)
      return { success: false, message: `Invalid response from URL ${route} code: ${response?.status || '404'}.` }

    return {
      success: true,
      redirected: redirected ? response.request.responseURL : false,
      payload: response.data,
    }
  }
  // get page html content
  try {
    await page.setCacheEnabled(false)
    await page.setRequestInterception(true)
    page.on('request', (request) => {
      if (['image', 'stylesheet', 'font', 'other'].includes(request.resourceType()))
        request.abort()
      else
        request.continue()
    })

    const pageVisit = await page.goto(route, { waitUntil: resolvedConfig.scanner.skipJavascript ? 'domcontentloaded' : 'networkidle0' })
    // only 2xx we'll consider valid
    const { 'content-type': contentType, location } = pageVisit.headers()

    const statusCode = pageVisit.status()
    if ((statusCode === 301 || statusCode === 302) && location) {
      // redirect, failure but we'll queue the other url
      worker.queueRoute(normaliseRoute(location))
      return { success: false, message: `Redirect, queued the new URL: ${location}.` }
    }
    if (statusCode < 200 || statusCode >= 300)
      return { success: false, message: `Invalid status code: ${statusCode}.` }

    // only consider html content types
    if (contentType && !contentType.includes('text/html'))
      return { success: false, message: `Invalid content-type header: ${contentType}.` }

    // handle vite / spa's
    const payload = await (
      resolvedConfig.scanner.skipJavascript
        ? pageVisit.text()
        : page.evaluate(() => document.querySelector('*')?.outerHTML)
    )

    return {
      success: true,
      payload,
    }
  }
  catch (e) {
    return { success: false, message: `Exception thrown when visiting route: ${e}.` }
  }
}

export const processSeoMeta = ($: CheerioAPI) => {
  return {
    favicon: $('link[rel~="icon"]').attr('href') || '/favicon.ico',
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
  const { resolvedConfig, hooks } = useUnlighthouse()
  const { page, data: routeReport } = props
  const logger = useLogger()
  let html: string

  // basic caching based on saving html payloads
  if (resolvedConfig.cache && fs.existsSync(routeReport.htmlPayload)) {
    html = fs.readFileSync(routeReport.htmlPayload, { encoding: 'utf-8' })
    logger.debug(`Running \`inspectHtmlTask\` for \`${routeReport.route.path}\` using cache.`)
  }
  else {
    const start = new Date()
    const response = await extractHtmlPayload(page, routeReport.route.url)
    const end = new Date()
    const seconds = Math.round(end.getTime() - start.getTime())
    logger.debug(`HTML extract of \`${routeReport.route.url}\` took \`${seconds}\`ms`)

    if (!response.success || !response.payload) {
      routeReport.tasks.inspectHtmlTask = 'failed'
      logger.warn(`Failed to extract HTML payload from route \`${routeReport.route.path}\`: ${response.message}`)
      return routeReport
    }
    if (response.redirected)
      logger.info('Redirected url detected, this may cause issues in the final report.', response.redirected)
      // check if redirect url is already queued, if so we bail on this route

    html = response.payload
    // only need the html payload for caching purposes, unlike the lighthouse reports
    if (resolvedConfig.cache)
      fs.writeFileSync(routeReport.htmlPayload, html)
  }

  const $ = cheerio.load(html)
  routeReport.seo = processSeoMeta($)
  const internalLinks: string[] = []
  const externalLinks: string[] = []
  $('a').each(function() {
    const href = $(this).attr('href')
    // href must be provided and not be javascript
    if (!href || href.includes('javascript:') || href === '#')
      return

    // if the URL doesn't end with a slash we may be dealing with a file
    if (!href.endsWith('/')) {
      // need to check for a dot, meaning a file
      const parts = href.split('.')
      // 1 part means there is no extension, or no dot in the url
      if (parts.length > 1) {
        // presumably the last part will be the extension
        const extension = trimSlashes(parts[parts.length - 1]).replace('.', '')
        if (extension !== 'html')
          return
      }
    }
    if ((href.startsWith('/') && !href.startsWith('//')) || href.includes(resolvedConfig.site))
      internalLinks.push(href)
    else
      externalLinks.push(href)
  })
  await hooks.callHook('discovered-internal-links', routeReport.route.path, internalLinks)
  routeReport.seo.internalLinks = internalLinks.length
  routeReport.seo.externalLinks = externalLinks.length
  logger.success(`Completed \`inspectHtmlTask\` for \`${routeReport.route.path}\`. [Size: \`${formatBytes(html.length)}\`]`)
  return routeReport
}
