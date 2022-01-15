import fs from 'fs-extra'
import type { CheerioAPI } from 'cheerio'
import cheerio from 'cheerio'
import type { Page } from 'puppeteer'
import type { PuppeteerTask } from '../../types'
import { useUnlighthouse } from '../../unlighthouse'
import { useLogger } from '../../logger'
import { formatBytes, trimSlashes } from '../../util'
import { normaliseRoute } from '../../router'

export const extractHtmlPayload: (page: Page, route: string) => Promise<{ success: boolean; message?: string; payload?: string }> = async(page, route) => {
  const { worker, resolvedConfig } = useUnlighthouse()
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

    const pageVisit = await page.goto(route, { waitUntil: resolvedConfig.scanner.isHtmlSSR ? 'domcontentloaded' : 'networkidle0' })
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
      resolvedConfig.scanner.isHtmlSSR
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
    const response = await extractHtmlPayload(page, routeReport.route.url)
    if (!response.success || !response.payload) {
      routeReport.tasks.inspectHtmlTask = 'failed'
      logger.warn(`Failed to extract HTML payload from route \`${routeReport.route.path}\`: ${response.message}`)
      return routeReport
    }

    html = response.payload
    fs.writeFileSync(routeReport.htmlPayload, html)
  }

  const $ = cheerio.load(html)
  routeReport.seo = processSeoMeta($)
  const internalLinks: string[] = []
  const externalLinks: string[] = []
  $('a').each(function() {
    const href = $(this).attr('href')
    if (!href)
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
    if ((href.startsWith('/') && !href.startsWith('//')) || href.includes(resolvedConfig.host))
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
