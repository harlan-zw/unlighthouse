export function getLastPathSegment(path: string) {
  const segments = path.split('/')
  return segments.slice(-1).join('/')
}

export function getPathSegments(path: string, size: number): string {
  const segments = path.split('/')

  if (segments.length <= size)
    return path

  return segments.slice(0, size + 1).join('/')
}

/**
 * Strip a URL down to a human-readable label: drop the protocol, a leading
 * `www.`, the `sc-domain:` prefix, and any trailing slash. Bare domains and
 * paths pass through cleaned.
 */
export function prettifyUrl(input: string | null | undefined): string {
  if (!input)
    return ''
  return input
    .trim()
    .replace(/^sc-domain:/i, '')
    .replace(/^[a-z][\w+.-]*:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/\/+$/, '')
}

/**
 * Best-effort hostname extraction for favicon lookups. Falls back to the
 * cleaned input when it isn't a parseable absolute URL.
 */
export function urlHostname(input: string | null | undefined): string {
  if (!input)
    return ''
  const cleaned = input.trim().replace(/^sc-domain:/i, '')
  const withProto = /^[a-z][\w+.-]*:\/\//i.test(cleaned) ? cleaned : `https://${cleaned}`
  try {
    return new URL(withProto).hostname.replace(/^www\./i, '')
  }
  catch (_err) {
    // Fall back to the cleaned input when it is not parseable as a URL.
    return prettifyUrl(cleaned).split('/')[0] ?? ''
  }
}
