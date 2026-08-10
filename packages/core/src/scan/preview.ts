import type { CommandOutput, ScanPreview } from '@unlighthouse/contracts/commands'
import type { FetchConfig } from '../util/fetch'
import type { HttpProtection } from '../util/http-protection'
import { parseRobotsTxt } from '../policies/robots/parser'
import { extractSitemapRoutes } from '../seeds/sitemap'
import { fetchUrlRaw } from '../util/fetch'
import { extractPageDiscovery } from '../util/html-discovery'
import { detectHttpProtection } from '../util/http-protection'
import { normaliseUrl } from '../util/i18n'

type ScanPreviewResult = CommandOutput<typeof ScanPreview>

export interface ScanPreviewIo {
  inspectSitemap: (site: string) => Promise<ScanPreviewProbe>
  inspectHomepage: (site: string) => Promise<ScanPreviewProbe>
}

export type ScanPreviewProbe
  = | { _tag: 'Urls', urls: string[], cloudflareTrapLinks: number }
    | {
      _tag: 'Blocked'
      reason: 'rate-limited' | 'cloudflare-challenge' | 'cloudflare-trap'
      retryAfterSeconds: number | null
    }

type Attempt<T>
  = | { _tag: 'Ok', value: T }
    | { _tag: 'Err', error: unknown }

function attempt<T>(promise: Promise<T>): Promise<Attempt<T>> {
  return promise
    .then(value => ({ _tag: 'Ok' as const, value }))
    .catch(error => ({ _tag: 'Err' as const, error }))
}

function countUniqueUrls(urls: string[]): number {
  return new Set(urls.map(url => normaliseUrl(url) ?? url)).size
}

export async function resolveScanPreview(
  input: { site: string, mode: 'site' | 'page' },
  io: ScanPreviewIo,
): Promise<ScanPreviewResult> {
  if (input.mode === 'page') {
    return {
      status: 'ready',
      site: input.site,
      mode: input.mode,
      urlCount: 1,
      source: 'single-page',
      confidence: 'high',
      warnings: [],
    }
  }

  const sitemap = await attempt(io.inspectSitemap(input.site))
  if (sitemap._tag === 'Ok') {
    const result = sitemap.value
    if (result._tag === 'Blocked') {
      return {
        status: 'blocked',
        site: input.site,
        mode: input.mode,
        reason: result.reason,
        retryAfterSeconds: result.retryAfterSeconds,
      }
    }
    if (result.urls.length > 0) {
      return {
        status: 'ready',
        site: input.site,
        mode: input.mode,
        urlCount: countUniqueUrls(result.urls),
        source: 'sitemap',
        confidence: 'high',
        warnings: result.cloudflareTrapLinks > 0 ? ['cloudflare-trap-links'] : [],
      }
    }
  }

  // Sitemap absence and fetch failures are expected. The homepage check is
  // the explicit lower-confidence fallback, not a swallowed error.
  const homepage = await attempt(io.inspectHomepage(input.site))
  if (homepage._tag === 'Ok') {
    const result = homepage.value
    if (result._tag === 'Blocked') {
      return {
        status: 'blocked',
        site: input.site,
        mode: input.mode,
        reason: result.reason,
        retryAfterSeconds: result.retryAfterSeconds,
      }
    }
    if (result.urls.length > 0) {
      return {
        status: 'ready',
        site: input.site,
        mode: input.mode,
        urlCount: countUniqueUrls(result.urls),
        source: 'homepage',
        confidence: 'low',
        warnings: result.cloudflareTrapLinks > 0 ? ['cloudflare-trap-links'] : [],
      }
    }
  }

  return {
    status: 'unavailable',
    site: input.site,
    mode: input.mode,
    reason: 'discovery-unavailable',
  }
}

export function createScanPreviewIo(config: FetchConfig): ScanPreviewIo {
  const timeoutMs = 8_000
  const maxRetries = 1

  return {
    async inspectSitemap(site) {
      const siteUrl = new URL(site)
      const robots = await attempt(fetchUrlRaw(`${siteUrl.origin}/robots.txt`, config, { timeoutMs, maxRetries }))
      if (robots._tag === 'Ok' && robots.value.response) {
        const protection = detectHttpProtection({
          status: robots.value.response.status,
          headers: robots.value.response.headers,
          body: robots.value.response.data,
        })
        if (protection._tag === 'RateLimited') {
          return {
            _tag: 'Blocked',
            reason: 'rate-limited',
            retryAfterSeconds: protection.retryAfterSeconds,
          }
        }
        if (protection._tag === 'CloudflareChallenge') {
          return {
            _tag: 'Blocked',
            reason: 'cloudflare-challenge',
            retryAfterSeconds: null,
          }
        }
      }
      const sitemapLocations = robots._tag === 'Ok' && robots.value.valid && robots.value.response
        ? parseRobotsTxt(robots.value.response.data).sitemaps
        : []
      const sitemapConfig = sitemapLocations.length > 0 ? sitemapLocations : true
      const protections: HttpProtection[] = []
      const result = await extractSitemapRoutes(
        {
          resolvedConfig: config,
          siteUrl,
          fetchTimeoutMs: timeoutMs,
          fetchMaxRetries: maxRetries,
          onResponse: response => protections.push(detectHttpProtection({
            status: response.status,
            headers: response.headers,
            body: response.data,
          })),
        },
        site,
        sitemapConfig,
      )
      const protection = protections.find(result => result._tag !== 'None')
      if (protection?._tag === 'RateLimited') {
        return {
          _tag: 'Blocked',
          reason: 'rate-limited',
          retryAfterSeconds: protection.retryAfterSeconds,
        }
      }
      if (protection?._tag === 'CloudflareChallenge') {
        return {
          _tag: 'Blocked',
          reason: 'cloudflare-challenge',
          retryAfterSeconds: null,
        }
      }
      return { _tag: 'Urls', urls: result.paths, cloudflareTrapLinks: 0 }
    },
    async inspectHomepage(site) {
      const fetched = await fetchUrlRaw(site, config, { timeoutMs, maxRetries })
      if (fetched.response) {
        const protection = detectHttpProtection({
          status: fetched.response.status,
          headers: fetched.response.headers,
          body: fetched.response.data,
        })
        if (protection._tag === 'RateLimited') {
          return {
            _tag: 'Blocked',
            reason: 'rate-limited',
            retryAfterSeconds: protection.retryAfterSeconds,
          }
        }
        if (protection._tag === 'CloudflareChallenge') {
          return {
            _tag: 'Blocked',
            reason: 'cloudflare-challenge',
            retryAfterSeconds: null,
          }
        }
      }
      if (!fetched.valid || !fetched.response)
        throw new Error('Homepage could not be fetched for scan preview.')
      const responseUrl = fetched.response.url || site
      const discovery = extractPageDiscovery({
        html: fetched.response.data,
        pageUrl: responseUrl,
        siteUrl: site,
      })
      if (discovery.cloudflareTrapLinks > 0 && discovery.links.length === 0) {
        return {
          _tag: 'Blocked',
          reason: 'cloudflare-trap',
          retryAfterSeconds: null,
        }
      }
      return {
        _tag: 'Urls',
        urls: discovery.pageIndexable
          ? [normaliseUrl(responseUrl) ?? responseUrl, ...discovery.links]
          : discovery.links,
        cloudflareTrapLinks: discovery.cloudflareTrapLinks,
      }
    },
  }
}
