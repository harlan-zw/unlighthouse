export type SitemapDocumentKind = 'index' | 'text' | 'unknown' | 'urlset'

export interface ParseSitemapDocumentOptions {
  /** Response content type, used to identify extensionless plain-text sitemaps. */
  contentType?: string | null
  /** Effective response URL, used to identify `.txt` sitemaps. */
  url?: string
}

export interface ParsedSitemapDocument {
  kind: SitemapDocumentKind
  locations: string[]
}

interface SitemapXmlRoot {
  kind: 'index' | 'urlset'
  prefix?: string
}

const NAMED_XML_ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&apos;': '\'',
  '&gt;': '>',
  '&lt;': '<',
  '&quot;': '"',
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function findMarkupEnd(xml: string, start: number): number {
  let quote: '"' | '\'' | null = null
  let subsetDepth = 0
  for (let i = start; i < xml.length; i++) {
    const char = xml[i]
    if (quote) {
      if (char === quote)
        quote = null
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char === '[') {
      subsetDepth++
      continue
    }
    if (char === ']') {
      subsetDepth = Math.max(0, subsetDepth - 1)
      continue
    }
    if (char === '>' && subsetDepth === 0)
      return i + 1
  }
  return -1
}

function findXmlRoot(xml: string): SitemapXmlRoot | null {
  let offset = xml.charCodeAt(0) === 0xFEFF ? 1 : 0
  while (offset < xml.length) {
    const whitespace = xml.slice(offset).match(/^\s+/)?.[0].length ?? 0
    offset += whitespace

    if (xml.startsWith('<?', offset)) {
      const end = xml.indexOf('?>', offset + 2)
      if (end === -1)
        return null
      offset = end + 2
      continue
    }
    if (xml.startsWith('<!--', offset)) {
      const end = xml.indexOf('-->', offset + 4)
      if (end === -1)
        return null
      offset = end + 3
      continue
    }
    if (/^<!doctype\b/i.test(xml.slice(offset))) {
      offset = findMarkupEnd(xml, offset + 2)
      if (offset === -1)
        return null
      continue
    }
    break
  }

  const root = xml.slice(offset).match(/^<(?:(?<prefix>[A-Z_][\w.-]*):)?(?<name>sitemapindex|urlset)\b[^>]*>/i)
  const name = root?.groups?.name
  if (!name)
    return null
  return {
    kind: name.toLowerCase() === 'sitemapindex' ? 'index' : 'urlset',
    prefix: root?.groups?.prefix,
  }
}

function decodeXmlText(value: string): string {
  const trimmed = value.trim()
  const cdata = trimmed.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/)
  if (cdata)
    return (cdata[1] ?? '').trim()

  return trimmed.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);/g, (entity) => {
    const named = NAMED_XML_ENTITIES[entity]
    if (named !== undefined)
      return named

    const numeric = entity.startsWith('&#x')
      ? Number.parseInt(entity.slice(3, -1), 16)
      : Number.parseInt(entity.slice(2, -1), 10)
    if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 0x10FFFF || (numeric >= 0xD800 && numeric <= 0xDFFF))
      return entity
    return String.fromCodePoint(numeric)
  })
}

function extractXmlLocations(xml: string, root: SitemapXmlRoot): string[] {
  // Comments can contain examples with `<loc>` tags; they are not document entries.
  const document = xml.replace(/<!--[\s\S]*?-->/g, '')
  const prefix = root.prefix ? `(?:${escapeRegExp(root.prefix)}:)?` : ''
  const entryName = root.kind === 'index' ? 'sitemap' : 'url'
  const entries = new RegExp(`<${prefix}${entryName}\\b[^>]*>([\\s\\S]*?)<\\/${prefix}${entryName}\\s*>`, 'gi')
  const loc = new RegExp(`<${prefix}loc\\b[^>]*>([\\s\\S]*?)<\\/${prefix}loc\\s*>`, 'i')
  const locations: string[] = []

  for (const entry of document.matchAll(entries)) {
    const match = (entry[1] ?? '').match(loc)
    if (!match?.[1])
      continue
    const value = decodeXmlText(match[1])
    if (value)
      locations.push(value)
  }
  return locations
}

function isPlainTextSitemap(options: ParseSitemapDocumentOptions): boolean {
  const contentType = options.contentType?.split(';', 1)[0]?.trim().toLowerCase()
  if (contentType === 'text/plain')
    return true
  if (!options.url)
    return false
  try {
    return new URL(options.url).pathname.toLowerCase().endsWith('.txt')
  }
  catch {
    return /\.txt(?:[?#]|$)/i.test(options.url)
  }
}

function isTextLocation(value: string): boolean {
  if (value.startsWith('/') && !value.startsWith('//'))
    return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  }
  catch {
    return false
  }
}

/**
 * Parse the URL-bearing portion of XML and plain-text sitemap documents.
 *
 * This intentionally stays best-effort: validation belongs at an input/diagnostic
 * boundary, while seed discovery should recover any structurally valid entries.
 */
export function parseSitemapDocument(input: string, options: ParseSitemapDocumentOptions = {}): ParsedSitemapDocument {
  const root = findXmlRoot(input)
  if (root) {
    return {
      kind: root.kind,
      locations: extractXmlLocations(input, root),
    }
  }

  if (isPlainTextSitemap(options) && !input.trimStart().startsWith('<')) {
    const locations = input
      .replace(/^\uFEFF/, '')
      .split(/\r\n?|\n/)
      .map(line => line.trim())
      .filter(isTextLocation)
    return { kind: 'text', locations }
  }

  return { kind: 'unknown', locations: [] }
}

/** Resolve a sitemap location without permitting non-HTTP protocols. */
export function resolveSitemapLocation(location: string, baseUrl: string): string | null {
  try {
    const url = new URL(location, baseUrl)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null
  }
  catch {
    return null
  }
}

function htmlAttribute(tag: string, name: string): string | null {
  const escaped = escapeRegExp(name)
  const match = tag.match(new RegExp(`\\b${escaped}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>]+))`, 'i'))
  return match ? decodeXmlText(match[1] ?? match[2] ?? match[3] ?? '') : null
}

function metaRefreshTarget(content: string): string | null {
  const separator = content.indexOf(';')
  if (separator === -1 || !/^\d+(?:\.\d+)?$/.test(content.slice(0, separator).trim()))
    return null
  const directive = content.slice(separator + 1).trim()
  const equals = directive.indexOf('=')
  if (equals === -1 || directive.slice(0, equals).trim().toLowerCase() !== 'url')
    return null
  let value = directive.slice(equals + 1).trim()
  const quote = value[0]
  if ((quote === '"' || quote === '\'') && value.at(-1) === quote)
    value = value.slice(1, -1).trim()
  return value || null
}

/** Resolve an HTML meta-refresh target, if the document advertises one. */
export function extractSitemapMetaRefreshUrl(html: string, baseUrl: string): string | null {
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = match[0]
    if (htmlAttribute(tag, 'http-equiv')?.toLowerCase() !== 'refresh')
      continue
    const content = htmlAttribute(tag, 'content')
    const value = content ? metaRefreshTarget(content) : null
    if (!value)
      continue
    return resolveSitemapLocation(value, baseUrl)
  }
  return null
}
