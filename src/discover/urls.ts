const SKIP_EXTENSIONS = new Set([
  'pdf', 'zip', 'gz', 'tar', 'rar', '7z', 'dmg', 'exe', 'apk', 'ipa',
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'svg', 'ico', 'bmp', 'tif', 'tiff', 'heic',
  'mp4', 'webm', 'mov', 'avi', 'mkv', 'mp3', 'wav', 'ogg', 'flac', 'm4a',
  'css', 'js', 'mjs', 'map', 'json', 'xml', 'rss', 'atom', 'txt', 'csv', 'md', 'yaml', 'yml',
  'woff', 'woff2', 'ttf', 'otf', 'eot',
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods',
])

export function normalizeUrl(raw: string, base: string | URL, keepQuery: readonly string[] = []): URL | null {
  let url: URL
  try {
    url = new URL(raw.trim(), base)
  }
  catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:')
    return null
  url.hash = ''
  url.username = ''
  url.password = ''
  url.pathname = url.pathname.replace(/;jsessionid=[^/]*/gi, '')
  const kept = [...url.searchParams].filter(([key]) => keepQuery.includes(key)).sort(([a], [b]) => a.localeCompare(b))
  url.search = kept.length ? new URLSearchParams(kept).toString() : ''
  return url
}

export function isHtmlCandidate(url: URL): boolean {
  const last = url.pathname.split('/').pop() ?? ''
  const dot = last.lastIndexOf('.')
  if (dot === -1)
    return true
  return !SKIP_EXTENSIONS.has(last.slice(dot + 1).toLowerCase())
}

export function pathOf(url: URL): string {
  return url.pathname + url.search
}

export function matchesAny(path: string, globs: readonly string[]): boolean {
  return globs.some(glob => new Bun.Glob(glob).match(path))
}

export function hashUrl(url: string): string {
  return new Bun.CryptoHasher('sha1').update(url).digest('hex').slice(0, 16)
}

function apexOf(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host
}

export function alignOrigin(url: URL, origin: string): URL {
  const target = new URL(origin)
  if (url.origin === target.origin)
    return url
  const sameHost = apexOf(url.hostname) === apexOf(target.hostname) && url.port === target.port
  const upgrade = url.protocol === target.protocol || (url.protocol === 'http:' && target.protocol === 'https:')
  if (!sameHost || !upgrade)
    return url
  const aligned = new URL(url.href)
  aligned.protocol = target.protocol
  aligned.host = target.host
  return aligned
}
