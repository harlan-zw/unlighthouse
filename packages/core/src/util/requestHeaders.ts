import type { ResolvedUserConfig } from '../types'
import { Buffer } from 'node:buffer'

type RequestIdentity = Partial<Pick<ResolvedUserConfig, 'cookies' | 'auth' | 'extraHeaders'>>
type Cookie = Exclude<ResolvedUserConfig['cookies'], false>[number]

/**
 * The subset of cookie fields that both `page.setCookie()` and CDP `Storage.setCookies` accept.
 */
export interface BrowserCookie {
  name: string
  value: string
  url?: string
  domain?: string
  path?: string
  secure?: boolean
}

/**
 * Whether a cookie applies to a request URL, following the RFC 6265 domain, path, and secure rules.
 *
 * A cookie without a `domain` belongs to the scanned `site` only. A `domain` with a leading dot also matches subdomains,
 * the way Chrome reports domain cookies; without the dot it matches that host only.
 */
export function cookieAppliesTo(cookie: Cookie, url: string, site: string): boolean {
  const { hostname, pathname, protocol } = new URL(url)
  const domain = cookie.domain ? String(cookie.domain).toLowerCase() : new URL(site).hostname
  const host = hostname.toLowerCase()
  const domainMatches = domain.startsWith('.')
    ? host === domain.slice(1) || host.endsWith(domain)
    : host === domain
  if (!domainMatches)
    return false
  const path = cookie.path ? String(cookie.path) : '/'
  const pathMatches = pathname === path
    || (pathname.startsWith(path) && (path.endsWith('/') || pathname[path.length] === '/'))
  if (!pathMatches)
    return false
  const secure = (cookie as Record<string, unknown>).secure
  return !(secure === true || secure === 'true') || protocol === 'https:'
}

/**
 * The headers that identify unlighthouse to the site: `extraHeaders` and `auth` as basic auth. With a `url`, it adds a
 * `Cookie` header holding only the cookies that apply to that URL, for requests made outside the browser.
 * An explicit `Cookie` or `Authorization` in `extraHeaders` wins.
 *
 * Only request paths that target the scanned origin may use this. Browser requests get cookies from the cookie jar
 * instead (see `toBrowserCookies`) and auth from the challenge based `page.authenticate`, because a page wide header
 * would go to every host the page loads from (see `resolvePageHeaders`).
 */
export function resolveRequestHeaders(
  { cookies, auth, extraHeaders }: RequestIdentity,
  request?: { url: string, site: string },
): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders }
  const has = (name: string) => Object.keys(headers).some(key => key.toLowerCase() === name)
  if (request && cookies && !has('cookie')) {
    const matching = cookies.filter(cookie => cookieAppliesTo(cookie, request.url, request.site))
    if (matching.length)
      headers.Cookie = matching.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
  }
  if (auth && !has('authorization'))
    headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`
  return headers
}

/**
 * The page wide headers of a browser page: only the explicit `extraHeaders`.
 * A page wide header goes to every host the page loads from, so derived credentials stay out of it.
 * `auth` rides on the challenge based `page.authenticate`, cookies on the cookie jar (see `toBrowserCookies`).
 */
export function resolvePageHeaders({ extraHeaders }: RequestIdentity): Record<string, string> {
  return { ...extraHeaders }
}

/**
 * Cookies for the browser cookie jar, which applies the domain and path rules to every request itself.
 * A cookie without a `domain` is scoped to the scanned `site`.
 */
export function toBrowserCookies(cookies: ResolvedUserConfig['cookies'], site: string): BrowserCookie[] {
  if (!cookies)
    return []
  return cookies.map((cookie) => {
    const { name, value, domain, path } = cookie
    const secure = (cookie as Record<string, unknown>).secure
    if (!domain)
      return { name, value, url: site, ...(path ? { path } : {}) }
    return { name, value, domain, path: path || '/', secure: secure === true || secure === 'true' }
  })
}
