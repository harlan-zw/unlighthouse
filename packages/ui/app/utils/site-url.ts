/** Normalize the scheme-optional URL accepted by dashboard forms. */
export function normalizeSiteUrl(value: string): string | null {
  const input = value.trim()
  if (!input)
    return null
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(input) && !/^https?:\/\//i.test(input))
    return null
  const candidate = /^https?:\/\//i.test(input) ? input : `https://${input}`
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
