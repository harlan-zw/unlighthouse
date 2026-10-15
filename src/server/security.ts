import { timingSafeEqual } from 'node:crypto'
import { isIP } from 'node:net'

export const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1']

export function randomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url')
}

export function hostnameOf(host: string | null): string | null {
  if (!host)
    return null
  try {
    const hostname = new URL(`http://${host}`).hostname.toLowerCase()
    return hostname.startsWith('[') ? hostname.slice(1, -1) : hostname
  }
  catch {
    return null
  }
}

export function isLoopbackHost(host: string): boolean {
  return LOOPBACK_HOSTS.includes(host) || host.startsWith('127.')
}

export function hostAllowed(request: Request, allowed: ReadonlySet<string>): boolean {
  const hostname = hostnameOf(request.headers.get('host'))
  if (!hostname)
    return false
  return allowed.has(hostname) || isIP(hostname) !== 0
}

export function originAllowed(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (origin === null) {
    const site = request.headers.get('sec-fetch-site')
    return site === null || site === 'same-origin' || site === 'none'
  }
  const host = request.headers.get('host')
  return origin === `http://${host}` || origin === `https://${host}`
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

export function readCookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie')
  if (!header)
    return null
  for (const part of header.split(';')) {
    const index = part.indexOf('=')
    if (index < 0)
      continue
    if (part.slice(0, index).trim() === name)
      return decodeURIComponent(part.slice(index + 1).trim())
  }
  return null
}

export function tokenMatches(request: Request, token: string, cookieName: string): boolean {
  const authorization = request.headers.get('authorization')
  if (authorization?.toLowerCase().startsWith('bearer ') && safeEqual(authorization.slice(7).trim(), token))
    return true
  const cookie = readCookie(request, cookieName)
  return cookie !== null && safeEqual(cookie, token)
}

export function sessionCookie(name: string, token: string): string {
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`
}

export function tokenFromQuery(url: URL, token: string): boolean | null {
  const given = url.searchParams.get('token')
  if (given === null)
    return null
  return safeEqual(given, token)
}
