import type { HTMLExtractPayload, PuppeteerTask } from '../../types'
import type { Page } from '../../types/puppeteer'
import { Buffer } from 'node:buffer'
import { join } from 'node:path'
import fs from 'fs-extra'
import { htmlToMarkdown } from 'mdream'
import { extractionPlugin } from 'mdream/plugins'
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

export function processSeoMeta(html: string, url: string): HTMLExtractPayload {
  let title = ''
  let description = ''
  let favicon = '/favicon.ico'
  let canonical = ''
  let robots = ''
  let alternativeLangDefault = ''
  const hreflang: Array<{ lang: string, href: string }> = []
  const jsonLd: any[] = []
  const og: HTMLExtractPayload['og'] = {}
  const twitter: HTMLExtractPayload['twitter'] = {}

  const extractionPluginInstance = extractionPlugin({
    'title': (element) => {
      if (!title && element.textContent)
        title = element.textContent.trim()
    },
    'meta[name="title"]': (element) => {
      if (!title && element.attributes?.content)
        title = element.attributes.content.trim()
    },
    'meta[name="description"]': (element) => {
      if (!description && element.attributes?.content)
        description = element.attributes.content.trim()
    },
    'link[rel~="icon"]': (element) => {
      if (element.attributes?.href)
        favicon = element.attributes.href
    },
    'link[rel="canonical"]': (element) => {
      if (!canonical && element.attributes?.href)
        canonical = element.attributes.href
    },
    'meta[name="robots"]': (element) => {
      if (!robots && element.attributes?.content)
        robots = element.attributes.content
    },
    // Hreflang
    'link[hreflang]': (element) => {
      const lang = element.attributes?.hreflang
      const href = element.attributes?.href
      if (lang && href) {
        if (lang === 'x-default')
          alternativeLangDefault = href
        hreflang.push({ lang, href })
      }
    },
    // Open Graph
    'meta[property="og:title"]': (element) => {
      if (!og.title && element.attributes?.content)
        og.title = element.attributes.content.trim()
    },
    'meta[property="og:description"]': (element) => {
      if (!og.description && element.attributes?.content)
        og.description = element.attributes.content.trim()
    },
    'meta[property="og:image"]': (element) => {
      if (!og.image && element.attributes?.content)
        og.image = element.attributes.content.trim()
    },
    'meta[property="og:url"]': (element) => {
      if (!og.url && element.attributes?.content)
        og.url = element.attributes.content.trim()
    },
    'meta[property="og:type"]': (element) => {
      if (!og.type && element.attributes?.content)
        og.type = element.attributes.content.trim()
    },
    // Twitter Cards
    'meta[name="twitter:card"]': (element) => {
      if (!twitter.card && element.attributes?.content)
        twitter.card = element.attributes.content.trim()
    },
    'meta[name="twitter:title"]': (element) => {
      if (!twitter.title && element.attributes?.content)
        twitter.title = element.attributes.content.trim()
    },
    'meta[name="twitter:description"]': (element) => {
      if (!twitter.description && element.attributes?.content)
        twitter.description = element.attributes.content.trim()
    },
    'meta[name="twitter:image"]': (element) => {
      if (!twitter.image && element.attributes?.content)
        twitter.image = element.attributes.content.trim()
    },
    'meta[name="twitter:site"]': (element) => {
      if (!twitter.site && element.attributes?.content)
        twitter.site = element.attributes.content.trim()
    },
    // JSON-LD structured data
    'script[type="application/ld+json"]': (element) => {
      if (element.textContent) {
        try {
          const data = JSON.parse(element.textContent)
          jsonLd.push(data)
        }
        catch {
          // Invalid JSON-LD, skip
        }
      }
    },
  })

  htmlToMarkdown(html, {
    plugins: [extractionPluginInstance],
    origin: new URL(url).origin,
  })

  return {
    title: title || undefined,
    description: description || undefined,
    metaDescription: description || undefined,
    favicon,
    canonical: canonical || undefined,
    robots: robots || undefined,
    alternativeLangDefault: alternativeLangDefault || undefined,
    alternativeLangDefaultHtml: alternativeLangDefault
      ? `<link hreflang="x-default" href="${alternativeLangDefault}">`
      : undefined,
    og: Object.keys(og).length > 0 ? og : undefined,
    twitter: Object.keys(twitter).length > 0 ? twitter : undefined,
    hreflang: hreflang.length > 0 ? hreflang : undefined,
    jsonLd: jsonLd.length > 0 ? jsonLd : undefined,
  }
}

/**
 * Extract SEO metadata and count internal/external links in a single pass
 */
export function extractSeoAndLinks(html: string, url: string, siteUrl: string): {
  seo: HTMLExtractPayload
  internalLinks: number
  externalLinks: number
} {
  let title = ''
  let description = ''
  let favicon = '/favicon.ico'
  let canonical = ''
  let robots = ''
  let alternativeLangDefault = ''
  const hreflang: Array<{ lang: string, href: string }> = []
  const jsonLd: any[] = []
  const og: HTMLExtractPayload['og'] = {}
  const twitter: HTMLExtractPayload['twitter'] = {}
  let internalLinks = 0
  let externalLinks = 0

  const origin = new URL(url).origin

  const extractionPluginInstance = extractionPlugin({
    'title': (element) => {
      if (!title && element.textContent)
        title = element.textContent.trim()
    },
    'meta[name="title"]': (element) => {
      if (!title && element.attributes?.content)
        title = element.attributes.content.trim()
    },
    'meta[name="description"]': (element) => {
      if (!description && element.attributes?.content)
        description = element.attributes.content.trim()
    },
    'link[rel~="icon"]': (element) => {
      if (element.attributes?.href)
        favicon = element.attributes.href
    },
    'link[rel="canonical"]': (element) => {
      if (!canonical && element.attributes?.href)
        canonical = element.attributes.href
    },
    'meta[name="robots"]': (element) => {
      if (!robots && element.attributes?.content)
        robots = element.attributes.content
    },
    'link[hreflang]': (element) => {
      const lang = element.attributes?.hreflang
      const href = element.attributes?.href
      if (lang && href) {
        if (lang === 'x-default')
          alternativeLangDefault = href
        hreflang.push({ lang, href })
      }
    },
    'meta[property="og:title"]': (element) => {
      if (!og.title && element.attributes?.content)
        og.title = element.attributes.content.trim()
    },
    'meta[property="og:description"]': (element) => {
      if (!og.description && element.attributes?.content)
        og.description = element.attributes.content.trim()
    },
    'meta[property="og:image"]': (element) => {
      if (!og.image && element.attributes?.content)
        og.image = element.attributes.content.trim()
    },
    'meta[property="og:url"]': (element) => {
      if (!og.url && element.attributes?.content)
        og.url = element.attributes.content.trim()
    },
    'meta[property="og:type"]': (element) => {
      if (!og.type && element.attributes?.content)
        og.type = element.attributes.content.trim()
    },
    'meta[name="twitter:card"]': (element) => {
      if (!twitter.card && element.attributes?.content)
        twitter.card = element.attributes.content.trim()
    },
    'meta[name="twitter:title"]': (element) => {
      if (!twitter.title && element.attributes?.content)
        twitter.title = element.attributes.content.trim()
    },
    'meta[name="twitter:description"]': (element) => {
      if (!twitter.description && element.attributes?.content)
        twitter.description = element.attributes.content.trim()
    },
    'meta[name="twitter:image"]': (element) => {
      if (!twitter.image && element.attributes?.content)
        twitter.image = element.attributes.content.trim()
    },
    'meta[name="twitter:site"]': (element) => {
      if (!twitter.site && element.attributes?.content)
        twitter.site = element.attributes.content.trim()
    },
    'script[type="application/ld+json"]': (element) => {
      if (element.textContent) {
        try {
          jsonLd.push(JSON.parse(element.textContent))
        }
        catch {
          // Invalid JSON-LD
        }
      }
    },
    // Count links
    'a[href]': (element) => {
      const href = element.attributes?.href
      if (!href || href.startsWith('javascript:') || href.startsWith('mailto:') || href === '#')
        return
      if (!isImplicitOrExplicitHtml(href))
        return

      if ((href.startsWith('/') && !href.startsWith('//')) || href.includes(siteUrl))
        internalLinks++
      else
        externalLinks++
    },
  })

  htmlToMarkdown(html, {
    plugins: [extractionPluginInstance],
    origin,
  })

  return {
    seo: {
      title: title || undefined,
      description: description || undefined,
      metaDescription: description || undefined,
      favicon,
      canonical: canonical || undefined,
      robots: robots || undefined,
      alternativeLangDefault: alternativeLangDefault || undefined,
      alternativeLangDefaultHtml: alternativeLangDefault
        ? `<link hreflang="x-default" href="${alternativeLangDefault}">`
        : undefined,
      og: Object.keys(og).length > 0 ? og : undefined,
      twitter: Object.keys(twitter).length > 0 ? twitter : undefined,
      hreflang: hreflang.length > 0 ? hreflang : undefined,
      jsonLd: jsonLd.length > 0 ? jsonLd : undefined,
    },
    internalLinks,
    externalLinks,
  }
}

export const inspectHtmlTask: PuppeteerTask = async (props) => {
  const unlighthouse = useUnlighthouse()
  const { resolvedConfig, runtimeSettings } = unlighthouse
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

  // Extract SEO meta and count links using mdream
  const { seo, internalLinks, externalLinks } = extractSeoAndLinks(html, routeReport.route.url, resolvedConfig.site)
  routeReport.seo = seo
  routeReport.seo.internalLinks = internalLinks
  routeReport.seo.externalLinks = externalLinks
  routeReport.seo.htmlSize = html.length

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

  // only need the html payload for caching purposes, unlike the lighthouse reports
  if (resolvedConfig.cache)
    fs.writeFileSync(htmlPayloadPath, html)
  return routeReport
}
