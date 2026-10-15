export type FetchText = (url: string) => Promise<{ status: number, body: string } | null>

const LOC = /<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi
const URL_BLOCK = /<url[\s>][\s\S]*?<\/url>/gi
const ALTERNATE_LINK = /<(?:[\w-]+:)?link\b[^>]*>/gi
const ATTRIBUTE = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g

export interface SitemapAlternate {
  hreflang: string
  href: string
}

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&amp;/g, '&')
}

export function parseSitemap(body: string): { pages: string[], sitemaps: string[] } {
  const text = body.replace(/^\uFEFF/, '').trimStart()
  if (!text.startsWith('<')) {
    const pages = text.split(/\r?\n/).map(line => line.trim()).filter(line => /^https?:\/\//i.test(line))
    return { pages, sitemaps: [] }
  }
  const locs = [...text.matchAll(LOC)].map(match => decodeXml(match[1]!))
  return /<sitemapindex[\s>]/i.test(text) ? { pages: [], sitemaps: locs } : { pages: locs, sitemaps: [] }
}

export function parseSitemapAlternates(body: string): Map<string, SitemapAlternate[]> {
  const out = new Map<string, SitemapAlternate[]>()
  for (const [block] of body.matchAll(URL_BLOCK)) {
    const loc = new RegExp(LOC.source, 'i').exec(block)?.[1]
    if (!loc)
      continue
    const alternates: SitemapAlternate[] = []
    for (const [tag] of block.matchAll(ALTERNATE_LINK)) {
      const attributes = new Map([...tag.matchAll(ATTRIBUTE)].map(match => [match[1]!.toLowerCase(), decodeXml(match[2] ?? match[3] ?? '')]))
      const hreflang = attributes.get('hreflang')?.trim()
      const href = attributes.get('href')?.trim()
      if (hreflang && href && attributes.get('rel')?.toLowerCase().split(/\s+/).includes('alternate'))
        alternates.push({ hreflang, href })
    }
    if (alternates.length)
      out.set(decodeXml(loc), alternates)
  }
  return out
}

export interface SitemapEntry {
  url: string
  sitemap: string
}

export async function readSitemapEntries(roots: string[], fetchText: FetchText, limit: number, accept: (url: string) => boolean = () => true, onAlternates?: (url: string, alternates: SitemapAlternate[]) => void): Promise<SitemapEntry[]> {
  const seen = new Set<string>()
  const listed = new Set<string>()
  const entries: SitemapEntry[] = []
  let frontier = [...new Set(roots)]
  for (let depth = 0; depth < 4 && frontier.length && entries.length < limit; depth++) {
    const next: string[] = []
    for (const url of frontier) {
      if (entries.length >= limit || seen.has(url) || seen.size > 200)
        continue
      seen.add(url)
      const response = await fetchText(url)
      if (!response || response.status >= 400)
        continue
      const parsed = parseSitemap(response.body)
      if (onAlternates && parsed.pages.length) {
        for (const [page, alternates] of parseSitemapAlternates(response.body))
          onAlternates(page, alternates)
      }
      next.push(...parsed.sitemaps)
      for (const page of parsed.pages) {
        if (listed.has(page) || !accept(page))
          continue
        listed.add(page)
        entries.push({ url: page, sitemap: url })
        if (entries.length >= limit)
          break
      }
    }
    frontier = next
  }
  return entries
}

export async function readSitemaps(roots: string[], fetchText: FetchText, limit: number, accept?: (url: string) => boolean): Promise<string[]> {
  return (await readSitemapEntries(roots, fetchText, limit, accept)).map(entry => entry.url)
}
