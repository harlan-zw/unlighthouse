import type { ResolvedUserConfig } from '../types'
import { Buffer } from 'node:buffer'

type RequestIdentity = Partial<Pick<ResolvedUserConfig, 'cookies' | 'auth' | 'extraHeaders'>>

/**
 * The headers that identify unlighthouse to the site: `extraHeaders`, `cookies` as a `Cookie` header, and `auth` as
 * basic auth. Every request path uses this, the site check, the HTML inspection, and the Lighthouse run, so a session
 * reaches all of them. An explicit `Cookie` or `Authorization` in `extraHeaders` wins.
 */
export function resolveRequestHeaders({ cookies, auth, extraHeaders }: RequestIdentity): Record<string, string> {
  const headers: Record<string, string> = { ...extraHeaders }
  const has = (name: string) => Object.keys(headers).some(key => key.toLowerCase() === name)
  if (cookies && cookies.length && !has('cookie'))
    headers.Cookie = cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ')
  if (auth && !has('authorization'))
    headers.Authorization = `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`
  return headers
}
