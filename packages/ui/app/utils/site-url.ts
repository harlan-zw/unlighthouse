/** Normalize the scheme-optional URL accepted by dashboard forms. */
export function normalizeSiteUrl(value: string): string | null {
  const input = value.trim()
  if (!input)
    return null
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input) && !/^https?:\/\//i.test(input))
    return null
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`
  // URL parsing is not consistent across our runtimes here: Chromium
  // percent-encodes spaces in a hostname while Node rejects them, and both
  // silently strip tabs/newlines from an authority. Reject raw whitespace in
  // the authority up front so form validation never forwards a malformed host
  // to scan.start. Whitespace in a path remains valid and is URL-encoded.
  const authority = candidate.match(/^https?:\/\/([^/?#]*)/i)?.[1]
  if (!authority || /\s/.test(authority))
    return null
  try {
    const url = new URL(candidate)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname)
      return null
    return url.toString()
  }
  catch (_err) {
    return null
  }
}
