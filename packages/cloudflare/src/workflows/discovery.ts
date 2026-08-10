import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { manualSeeds } from '@unlighthouse/core/seeds'
import { createFilter } from '@unlighthouse/core/util/filter'
import { extractPageDiscovery } from '@unlighthouse/core/util/html-discovery'
import { fuseSeedsDedup, workerSitemapSeeds } from '../seeds'

export const MAX_CLOUDFLARE_SCAN_QUEUE = 200
export const MAX_LINK_DISCOVERY_HTML_BYTES = 2 * 1024 * 1024

function buildAllows(config: UnlighthouseConfig): (url: string) => boolean {
  const filter = createFilter({
    include: config.scanner?.include,
    exclude: config.scanner?.exclude,
  })
  return (url: string): boolean => {
    try {
      return filter(new URL(url).pathname)
    }
    catch (_err) {
      return filter(url)
    }
  }
}

export async function readBoundedText(response: Response, maxBytes: number): Promise<string> {
  const declaredLength = response.headers.get('content-length')
  if (declaredLength !== null) {
    const bytes = Number(declaredLength)
    if (Number.isFinite(bytes) && bytes > maxBytes)
      throw new RangeError(`Response body exceeds ${maxBytes} bytes.`)
  }

  if (!response.body)
    return ''

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done)
        break
      bytes += value.byteLength
      if (bytes > maxBytes) {
        await reader.cancel('response body limit exceeded')
        throw new RangeError(`Response body exceeds ${maxBytes} bytes.`)
      }
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  }
  finally {
    reader.releaseLock()
  }
}

export interface CloudflareInitialDiscoveryInput {
  site: string
  mode: 'site' | 'page'
  config: UnlighthouseConfig
}

export interface CloudflareInitialDiscoveryResult {
  urls: string[]
  linkDiscovery: boolean
}

/** Discover the stable initial queue from the manual seed and sitemap. */
export async function discoverCloudflareScanUrls(
  input: CloudflareInitialDiscoveryInput,
): Promise<CloudflareInitialDiscoveryResult> {
  const { site, mode, config } = input
  const seedSources = [manualSeeds({ urls: [site] })]
  const sitemap = config.scanner?.sitemap
  if (mode !== 'page' && sitemap !== false) {
    seedSources.push(workerSitemapSeeds({
      site: () => site,
      sitemaps: Array.isArray(sitemap) ? sitemap : true,
    }))
  }

  const allows = buildAllows(config)
  const urls: string[] = []
  const seen = new Set<string>()
  for await (const seed of fuseSeedsDedup(seedSources).seeds()) {
    if (urls.length >= MAX_CLOUDFLARE_SCAN_QUEUE)
      break
    if (seen.has(seed.url) || !allows(seed.url))
      continue
    seen.add(seed.url)
    urls.push(seed.url)
  }

  return {
    urls,
    linkDiscovery: mode !== 'page' && urls.length <= 1,
  }
}

export interface CloudflareLinkDiscoveryInput {
  pageUrl: string
  site: string
  config: UnlighthouseConfig
  maxBytes?: number
}

/** Fetch and parse bounded same-origin links for sitemap-less scans. */
export async function discoverCloudflarePageLinks(
  input: CloudflareLinkDiscoveryInput,
): Promise<string[]> {
  const response = await fetch(input.pageUrl, {
    headers: { accept: 'text/html' },
    // Never let discovery follow an unchecked redirect to a different origin.
    redirect: 'manual',
  })
  if (!response.ok || !(response.headers.get('content-type') ?? '').includes('text/html'))
    return []

  const html = await readBoundedText(response, input.maxBytes ?? MAX_LINK_DISCOVERY_HTML_BYTES)
  const discovery = extractPageDiscovery({ html, pageUrl: input.pageUrl, siteUrl: input.site })
  for (const malformed of discovery.malformedLinks) {
    logOperationalWarn('cloudflare.link_discovery_url_skipped', malformed.error, {
      raw: malformed.href,
      pageUrl: input.pageUrl,
    })
  }
  const allows = buildAllows(input.config)
  return discovery.links.filter(allows)
}
