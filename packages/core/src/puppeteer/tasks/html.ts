import type { HTMLExtractPayload, PuppeteerTask } from '../../types'
import type { Page } from '../../types/puppeteer'
import { Buffer } from 'node:buffer'
import { join } from 'node:path'
import fs from 'fs-extra'
import { withoutTrailingSlash } from 'ufo'
import { parse, render, walk } from 'ultrahtml'
import { useLogger } from '../../logger'
import { normaliseRoute } from '../../router'
import { useUnlighthouse } from '../../unlighthouse'
import { fetchUrlRaw, ReportArtifacts } from '../../util'
import { isImplicitOrExplicitHtml } from '../../util/filter'
import { setupPage } from '../util'

export const extractHtmlPayload: (page: Page, route: string) => Promise<{ success: boolean, redirected?: false | string, message?: string, payload?: string }> = async (page, route) => {
// ... (rest of extractHtmlPayload remains the same)
  const { worker, resolvedConfig } = useUnlighthouse()

  // if we don't need to execute any javascript we can do a less expensive fetch of the URL
  if (resolvedConfig.scanner.skipJavascript) {
    const { valid, response, redirected, redirectUrl } = await fetchUrlRaw(route, resolvedConfig)
    if (!valid || !response)
      return { success: false, message: `Invalid response from URL ${route} code: ${response?.status || '404'}.` }

    // ignore non-html
    if (response.headers['content-type'] && !response.headers['content-type'].includes('text/html'))
      return { success: false, message: `Non-HTML Content-Type header: ${response.headers['content-type']}.` }

    // ensure we have valid HTML content
    let htmlContent: string
    if (typeof response.data === 'string') {
      htmlContent = response.data
    }
    else if (Buffer.isBuffer(response.data)) {
      htmlContent = response.data.toString('utf-8')
    }
    else if (response.data && typeof response.data === 'object') {
      // if it's JSON or another object, convert to string
      htmlContent = JSON.stringify(response.data)
    }
    else {
      htmlContent = String(response.data || '')
    }

    // basic validation that we have some content
    if (!htmlContent.trim()) {
      return { success: false, message: `Empty response from URL ${route}.` }
    }

    return {
      success: true,
      redirected: redirected ? redirectUrl : false,
      payload: htmlContent,
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

export async function processHtml(html: string, site: string): Promise<{ seo: HTMLExtractPayload, internalLinks: string[], externalLinks: string[] }> {
  const seo: HTMLExtractPayload = {
    favicon: '/favicon.ico',
    og: {},
    internalLinks: 0,
    externalLinks: 0,
    htmlSize: html.length,
  }
  const internalLinks: string[] = []
  const externalLinks: string[] = []

  const ast = parse(html)
  await walk(ast, async (node) => {
    if (node.type === 1) { // ELEMENT_NODE
      if (node.name === 'link') {
        const rel = node.attributes?.rel
        const hreflang = node.attributes?.hreflang
        const href = node.attributes?.href
        if (hreflang === 'x-default' && href) {
          seo.alternativeLangDefault = href
          seo.alternativeLangDefaultHtml = await render(node)
        }
        if (rel && rel.includes('icon') && href) {
          seo.favicon = href
        }
      }
      else if (node.name === 'meta') {
        const name = node.attributes?.name
        const property = node.attributes?.property
        const content = node.attributes?.content
        if (name === 'title' && content)
          seo.title = content
        if (name === 'description' && content)
          seo.description = content
        if (property === 'og:image' || name === 'og:image')
          seo.og!.image = content
        if (property === 'og:description' || name === 'og:description')
          seo.og!.description = content
        if (property === 'og:title' || name === 'og:title')
          seo.og!.title = content
      }
      else if (node.name === 'title') {
        if (!seo.title && node.children?.[0]?.type === 2)
          seo.title = node.children[0].value
      }
      else if (node.name === 'a') {
        const href = node.attributes?.href
        if (href && !href.includes('javascript:') && !href.includes('mailto:') && !href.startsWith('#') && isImplicitOrExplicitHtml(href)) {
          if ((href.startsWith('/') && !href.startsWith('//')) || href.includes(site))
            internalLinks.push(href)
          else
            externalLinks.push(href)
        }
      }
    }
  })
  seo.internalLinks = internalLinks.length
  seo.externalLinks = externalLinks.length
  return { seo, internalLinks, externalLinks }
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

    html = typeof response.payload === 'string' ? response.payload : String(response.payload || '')
  }

  const { seo, internalLinks } = await processHtml(html, resolvedConfig.site)

  routeReport.seo = seo
  if (resolvedConfig.scanner.ignoreI18nPages && routeReport.seo.alternativeLangDefault && withoutTrailingSlash(routeReport.route.url) !== withoutTrailingSlash(routeReport.seo.alternativeLangDefault)) {
    // If this is the root path with cross-domain hreflang, disable ignoreI18nPages to prevent all routes from being ignored
    if (routeReport.route.path === '/') {
      try {
        const altUrl = new URL(routeReport.seo.alternativeLangDefault)
        const siteUrl = new URL(resolvedConfig.site)
        if (altUrl.origin !== siteUrl.origin) {
          logger.warn(`Root path (/) has cross-domain hreflang alternative. Automatically disabling \`ignoreI18nPages\` to prevent all routes from being ignored. Alternative: ${routeReport.seo.alternativeLangDefault}`)
          resolvedConfig.scanner.ignoreI18nPages = false
        }
      }
      catch {}
    }

    // Only ignore if ignoreI18nPages is still enabled (wasn't disabled above)
    if (resolvedConfig.scanner.ignoreI18nPages) {
      routeReport.tasks.inspectHtmlTask = 'ignore'
      const newRoute = normaliseRoute(routeReport.seo.alternativeLangDefault)
      const htmlTag = routeReport.seo.alternativeLangDefaultHtml || ''
      const baseMessage = `Page has a default alternative language ${htmlTag}, ignoring \`${routeReport.route.path}\` and queueing \`${newRoute}\`.`

      if (!unlighthouse._i18nWarn) {
        unlighthouse._i18nWarn = true
        logger.warn(`${baseMessage}\nTo scan this page, set \`scanner.ignoreI18nPages = false\` or update --site parameter to match the hreflang origin. Future warnings will be suppressed.`)
      }
      else {
        logger.debug(baseMessage)
      }
      // make sure we queue the default, this fixes issues with if the home page has a default lang that is alternative
      unlighthouse.worker.queueRoute(normaliseRoute(routeReport.seo.alternativeLangDefault))
      return routeReport
    }
  }

  await hooks.callHook('discovered-internal-links', routeReport.route.path, internalLinks)

  // only need the html payload for caching purposes, unlike the lighthouse reports
  if (resolvedConfig.cache)
    fs.writeFileSync(htmlPayloadPath, html)
  return routeReport
}
