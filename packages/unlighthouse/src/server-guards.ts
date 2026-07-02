// D-043 — local API hardening. Pure, side-effect-free request-guard helpers so
// the CSRF / DNS-rebinding / path-traversal decisions can be unit-tested without
// booting the h3 host (Chrome + storage + a real listener). server.ts wires the
// h3 middleware; every decision lands here as data-in / data-out.

import { isAbsolute, relative, resolve } from 'node:path'

// ── Host / origin classification ────────────────────────────────────────────

/** Strip surrounding `[]` from a bracketed IPv6 host (`[::1]` → `::1`). */
function stripBrackets(host: string): string {
  return host.startsWith('[') && host.includes(']')
    ? host.slice(1, host.indexOf(']'))
    : host
}

/** Drop the `:port` suffix from a `host[:port]` header value. IPv6-aware. */
function hostnameOf(hostHeader: string): string {
  const h = hostHeader.trim()
  if (h.startsWith('[')) {
    // `[::1]:5678` → `::1`
    const end = h.indexOf(']')
    return end === -1 ? stripBrackets(h) : h.slice(1, end)
  }
  // `localhost:5678` → `localhost`; a bare IPv6 (`::1`) has no port suffix.
  const colon = h.lastIndexOf(':')
  if (colon !== -1 && !h.slice(colon + 1).includes(':'))
    return h.slice(0, colon)
  return h
}

/** True for loopback hostnames (`localhost`, `127.0.0.0/8`, `::1`). */
export function isLoopbackHostname(host: string | null | undefined): boolean {
  if (!host)
    return false
  const s = stripBrackets(host).toLowerCase()
  return s === 'localhost'
    || s === '::1'
    || s === '::ffff:127.0.0.1'
    || s.startsWith('127.')
}

/**
 * True when the resolved bind host is an explicit exposure (non-loopback).
 * Loopback and an unset host (listhen defaults to `localhost`) are NOT exposed;
 * `0.0.0.0`, `::`, a LAN IP, or a public hostname are.
 */
export function isExposedHost(hostname: string | null | undefined): boolean {
  if (!hostname)
    return false
  return !isLoopbackHostname(hostname)
}

/** `new URL(x).origin`, or null when the value is missing / unparseable. */
export function normaliseOrigin(value: string | null | undefined): string | null {
  if (!value)
    return null
  try {
    return new URL(value).origin
  }
  catch {
    return null
  }
}

/** `new URL(x).host` (`hostname:port`), or null when unparseable. */
function originHost(value: string): string | null {
  try {
    return new URL(value).host
  }
  catch {
    return null
  }
}

// ── /api/** origin + host check ──────────────────────────────────────────────

export interface ApiOriginCheckInput {
  /** `Host` request header (e.g. `localhost:5678`). */
  host: string | null
  /** `Origin` request header, or null. */
  origin: string | null
  /** `Referer` request header, or null (used only when Origin is absent). */
  referer: string | null
  /** Configured `site` origin (e.g. `https://example.com`), or null. */
  siteOrigin: string | null
  /** Server bound to a non-loopback host (explicit `--host` / `host` config). */
  exposed: boolean
}

export type GuardDecision
  = | { _tag: 'allow', reason: string }
    | { _tag: 'reject', reason: string }

/**
 * Decide whether an `/api/**` request may proceed.
 *
 * ALLOW:
 *   - no Origin AND no Referer (non-browser clients: curl / CI / server fetch);
 *   - same-origin (the request's Origin host matches its own Host header);
 *   - the configured `site` origin (CORS-enabled dashboard embedding).
 * REJECT (403):
 *   - an untrusted `Host` header while bound to loopback (DNS-rebinding: the
 *     attacker's hostname resolved to 127.0.0.1, so Origin == Host would
 *     otherwise read as "same-origin"). Relaxed when the server is explicitly
 *     exposed, since its legitimate Host set (LAN IP / tunnel name) can't be
 *     enumerated;
 *   - any other cross-origin browser request.
 */
export function checkApiOrigin(input: ApiOriginCheckInput): GuardDecision {
  const { host, origin, referer, siteOrigin, exposed } = input

  // 1. Host-header validation — the real DNS-rebinding guard. A rebinding
  //    attack arrives with Host === Origin === attacker.example (both pointing
  //    at 127.0.0.1), which would sail through a naive same-origin check.
  const hostName = host ? hostnameOf(host) : null
  const hostTrusted = exposed || isLoopbackHostname(hostName)
  if (!hostTrusted)
    return { _tag: 'reject', reason: `untrusted Host header: ${host ?? '(none)'}` }

  // 2. Origin/Referer validation — the CSRF guard.
  const requestOrigin = normaliseOrigin(origin) ?? normaliseOrigin(referer)
  if (!requestOrigin)
    return { _tag: 'allow', reason: 'no Origin/Referer (non-browser client)' }

  // Same-origin: the browser page IS this dashboard, served on this Host.
  if (host != null && originHost(requestOrigin) === host)
    return { _tag: 'allow', reason: 'same-origin' }

  // Configured site origin: CORS-enabled embedding of the dashboard in the site.
  if (siteOrigin != null && requestOrigin === normaliseOrigin(siteOrigin))
    return { _tag: 'allow', reason: 'configured site origin' }

  return { _tag: 'reject', reason: `cross-origin request from ${requestOrigin}` }
}

// ── /__launch path constraint ────────────────────────────────────────────────

export type LaunchPathResult
  = | { _tag: 'ok', target: string }
    | { _tag: 'reject', reason: string }

/**
 * Resolve the `/__launch` `file` query param to an absolute path and assert it
 * stays inside `root`. `file` may be absolute (an editor click-through path) or
 * relative, and may carry launch-editor's trailing `:line[:column]` suffix,
 * which is stripped for the boundary check then re-appended to the launch
 * target. Anything that escapes `root` (`../../etc/passwd`, an absolute path
 * outside the project) is rejected.
 */
export function resolveLaunchPath(root: string, file: string): LaunchPathResult {
  // Separate a trailing `:line[:column]` so the boundary check runs on the
  // real filesystem path, not the editor position suffix.
  const m = /^(.*?)((?::\d+){0,2})$/.exec(file)
  const rawPath = m?.[1] || file
  const suffix = m?.[2] ?? ''

  const rootResolved = resolve(root)
  const candidate = isAbsolute(rawPath)
    ? resolve(rawPath)
    : resolve(rootResolved, rawPath)

  const rel = relative(rootResolved, candidate)
  const inside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))
  if (!inside)
    return { _tag: 'reject', reason: `path escapes root: ${file}` }

  return { _tag: 'ok', target: candidate + suffix }
}
