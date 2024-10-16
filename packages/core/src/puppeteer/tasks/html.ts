import type { CheerioAPI } from 'cheerio'
import type { Page } from 'puppeteer-core'
import type { HTMLExtractPayload, PuppeteerTask } from '../../types'
import { join } from 'node:path'
import { load as cheerio } from 'cheerio'
import fs from 'fs-extra'
import { withoutTrailingSlash } from 'ufo'
import { useLogger } from '../../logger'
import { normaliseRoute } from '../../router'
import { useUnlighthouse } from '../../unlighthouse'
import { fetchUrlRaw, ReportArtifacts } from '../../util'
import { isImplicitOrExplicitHtml } from '../../util/filter'
import { setupPage } from '../util'

export const extractHtmlPayload: (page: Page, route: string) => Promise<{ success: boolean, redirected?: false | string, message?: string, payload?: string }> = async (page, route) => {
  const { worker, resolvedConfig } = useUnlighthouse()

  // if we don't need to execute any javascript we can do a less expensive fetch of the URL
  if (resolvedConfig.scanner.skipJavascript) {
    const { valid, response, redirected, redirectUrl } = await fetchUrlRaw(route, resolvedConfig)
    if (!valid || !response)
      return { success: false, message: `Invalid response from URL ${route} code: ${response?.status || '404'}.` }

    // ignore non-html
    if (response.headers['content-type'] && !response.headers['content-type'].includes('text/html'))
      return { success: false, message: `Non-HTML Content-Type header: ${response.headers['content-type']}.` }

    return {
      success: true,
      redirected: redirected ? redirectUrl : false,
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

    await setupPage(page)

    const pageVisit = await page.goto(route, { waitUntil: resolvedConfig.scanner.skipJavascript ? 'domcontentloaded' : 'networkidle2' })
    if (!pageVisit)
      return { success: false, message: `Failed to go to route ${route}.` }

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

export function processSeoMeta($: CheerioAPI): HTMLExtractPayload {
  return {
    alternativeLangDefault: $('link[hreflang="x-default"]').attr('href'),
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

export const inspectHtmlTask: PuppeteerTask = async (props) => {
  const unlighthouse = useUnlighthouse()
  const { resolvedConfig, hooks, runtimeSettings } = unlighthouse
  const { page, data: routeReport } = props
  const logger = useLogger()
  let html: string

  // basic caching based on saving html payloads
  const htmlPayloadPath = join(routeReport.artifactPath, ReportArtifacts.html)
  if (resolvedConfig.cache && fs.existsSync(htmlPayloadPath)) {
    html = fs.readFileSync(htmlPayloadPath, { encoding: 'utf-8' })
    logger.debug(`Running \`inspectHtmlTask\` for \`${routeReport.route.path}\` using cache.`)
  }
  else {
    const response = await extractHtmlPayload(page, routeReport.route.url)
    logger.debug(`HTML extract of \`${routeReport.route.url}\` response ${response.success ? 'succeeded' : 'failed'}.`)

    if (!response.success || !response.payload) {
      routeReport.tasks.inspectHtmlTask = 'ignore'
      logger.info(`Skipping ${routeReport.route.path}. ${response.message}`)
      return routeReport
    }
    if (response.redirected) {
      // strip any protocols from the url
      const siteHost = runtimeSettings.siteUrl.host.split(':')[0]
      const redirectHost = new URL(response.redirected).host.split(':')[0]
      // allow subdomains
      if (siteHost !== redirectHost && !redirectHost.endsWith(`.${siteHost}`)) {
        routeReport.tasks.inspectHtmlTask = 'ignore'
        logger.warn(`Redirected URL goes to a different domain, ignoring. \`${response.redirected}\.`)
        return routeReport
      }
      // ignore redirect from site to site/
      if (withoutTrailingSlash(response.redirected) !== withoutTrailingSlash(runtimeSettings.siteUrl.href))
        logger.info('Redirected url detected, this may cause issues in the final report.', response.redirected)

      // check if redirect url is already queued, if so we bail on this route
    }

    html = response.payload
  }

  const $ = cheerio(html)
  routeReport.seo = processSeoMeta($)
  if (resolvedConfig.scanner.ignoreI18nPages && routeReport.seo.alternativeLangDefault && withoutTrailingSlash(routeReport.route.url) !== withoutTrailingSlash(routeReport.seo.alternativeLangDefault)) {
    routeReport.tasks.inspectHtmlTask = 'ignore'
    if (!unlighthouse._i18nWarn) {
      unlighthouse._i18nWarn = true
      logger.warn(`Page has an alternative lang, ignoring \`${routeReport.route.path}\`: ${routeReport.seo.alternativeLangDefault}. You can disable this behavior with the \`scanner.ignoreI18nPages = true\` option. Future warnings will be suppressed.`)
    }
    else {
      logger.debug(`Page has an alternative lang, ignoring \`${routeReport.route.path}\`: ${routeReport.seo.alternativeLangDefault}`)
    }
    // make sure we queue the default, this fixes issues with if the home page has a default lang that is alternative
    unlighthouse.worker.queueRoute(normaliseRoute(routeReport.seo.alternativeLangDefault))
    return routeReport
  }
  const internalLinks: string[] = []
  const externalLinks: string[] = []
  $('a').each(function () {
    const href = $(this).attr('href')
    // href must be provided and not be javascript
    if (!href || href.includes('javascript:') || href.includes('mailto:') || href === '#' || !isImplicitOrExplicitHtml(href))
      return

    if ((href.startsWith('/') && !href.startsWith('//')) || href.includes(resolvedConfig.site))
      internalLinks.push(href)
    else
      externalLinks.push(href)
  })
  await hooks.callHook('discovered-internal-links', routeReport.route.path, internalLinks)
  routeReport.seo.internalLinks = internalLinks.length
  routeReport.seo.externalLinks = externalLinks.length
  routeReport.seo.htmlSize = html.length

  // only need the html payload for caching purposes, unlike the lighthouse reports
  if (resolvedConfig.cache)
    fs.writeFileSync(htmlPayloadPath, html)
  return routeReport
}
