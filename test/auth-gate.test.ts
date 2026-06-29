// Unit tests for the Bearer-token auth gate (server.ts:createBearerAuthGate).
// Spins a minimal h3 app with just the gate handler so we can fire Request
// objects at it via toWebHandler without booting Chrome / storage / the
// real /api/* router.

import { createBearerAuthGate } from '../packages/unlighthouse/src/server'
import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'

interface MountOpts {
  apiToken: string
  apiBase?: string
  localBypass?: boolean
  trustProxy?: boolean
}

// Build a tiny app: auth gate first, then a catch-all that 200s with
// "ok" so we can tell pass-through from gate rejection. Returns a
// fetch-style handler compatible with `new Request(...)`.
function mountGated(opts: MountOpts): (req: Request) => Promise<Response> {
  const app = createApp()
  app.use(createBearerAuthGate({
    apiToken: opts.apiToken,
    apiBase: opts.apiBase ?? '/api',
    localBypass: opts.localBypass ?? false,
    trustProxy: opts.trustProxy ?? false,
  }))
  app.use(defineEventHandler(() => ({ ok: true })))
  return toWebHandler(app)
}

const TOKEN = 'unit-test-token-32chars-aaaaaaaaaaaaaaaa'

describe('auth gate — scope', () => {
  it('passes through anything outside /api/*', async () => {
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/index.html'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('gates /api/* when no Authorization header', async () => {
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/api/scan/current'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('unauthorized')
    expect(res.headers.get('www-authenticate')).toContain('Bearer')
  })

  it('honours a custom apiBase prefix', async () => {
    const h = mountGated({ apiToken: TOKEN, apiBase: '/internal/v2' })
    // Outside the custom prefix → pass.
    const outside = await h(new Request('http://test.local/api/scan/current'))
    expect(outside.status).toBe(200)
    // Inside the custom prefix → gated.
    const inside = await h(new Request('http://test.local/internal/v2/scan/current'))
    expect(inside.status).toBe(401)
  })

  it('does not match prefix-only paths (e.g. /apidocs does not match /api)', async () => {
    const h = mountGated({ apiToken: TOKEN, apiBase: '/api' })
    const res = await h(new Request('http://test.local/apidocs'))
    expect(res.status).toBe(200) // would be a real route if mounted
  })
})

describe('auth gate — token matching', () => {
  it('accepts the right token', async () => {
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/api/scan/current', {
      headers: { authorization: `Bearer ${TOKEN}` },
    }))
    expect(res.status).toBe(200)
  })

  it('rejects the wrong token', async () => {
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/api/scan/current', {
      headers: { authorization: 'Bearer not-the-right-one' },
    }))
    expect(res.status).toBe(401)
  })

  it('rejects an empty token', async () => {
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/api/scan/current', {
      headers: { authorization: 'Bearer ' },
    }))
    expect(res.status).toBe(401)
  })

  it('rejects a non-Bearer scheme', async () => {
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/api/scan/current', {
      headers: { authorization: `Basic ${Buffer.from(TOKEN).toString('base64')}` },
    }))
    expect(res.status).toBe(401)
  })

  it('rejects a token of wrong length without leaking timing', async () => {
    // The branch we want covered is the explicit length check that
    // short-circuits before timingSafeEqual to avoid leaking the
    // expected length.
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/api/scan/current', {
      headers: { authorization: 'Bearer short' },
    }))
    expect(res.status).toBe(401)
  })
})

describe('auth gate — exemptions', () => {
  it('exempts /api/health from the gate', async () => {
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/api/health'))
    expect(res.status).toBe(200)
  })

  it('exempts /api/ready from the gate', async () => {
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/api/ready'))
    expect(res.status).toBe(200)
  })

  it('exempts OPTIONS preflight from the gate', async () => {
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/api/scan/current', { method: 'OPTIONS' }))
    expect(res.status).toBe(200)
  })

  it('does NOT exempt /api/healthy (false prefix match)', async () => {
    // Sub-path "healthy" must not match "health" — the slice + split
    // exact compare is what guarantees this. Regression-prone if the
    // future swaps to startsWith().
    const h = mountGated({ apiToken: TOKEN })
    const res = await h(new Request('http://test.local/api/healthy'))
    expect(res.status).toBe(401)
  })
})

// LOCAL_BYPASS depends on the socket's remoteAddress (or X-F-F when
// trust-proxy is on). h3's toWebHandler doesn't synthesize a socket, so
// these tests exercise only the trust-proxy / X-F-F path which IS
// reachable through the Request headers.
describe('auth gate — local bypass (trust-proxy=true)', () => {
  it('bypasses when X-Forwarded-For is 127.0.0.1 and LOCAL_BYPASS is on', async () => {
    const h = mountGated({ apiToken: TOKEN, localBypass: true, trustProxy: true })
    const res = await h(new Request('http://test.local/api/scan/current', {
      headers: { 'x-forwarded-for': '127.0.0.1' },
    }))
    expect(res.status).toBe(200)
  })

  it('does NOT bypass when X-Forwarded-For is a real IP', async () => {
    const h = mountGated({ apiToken: TOKEN, localBypass: true, trustProxy: true })
    const res = await h(new Request('http://test.local/api/scan/current', {
      headers: { 'x-forwarded-for': '1.2.3.4' },
    }))
    expect(res.status).toBe(401)
  })

  it('uses the LEFT-most X-Forwarded-For entry (real client)', async () => {
    const h = mountGated({ apiToken: TOKEN, localBypass: true, trustProxy: true })
    // 1.2.3.4 is the real client; 127.0.0.1 is the proxy hop. Auth must
    // reject — otherwise a public client behind our own proxy looks
    // local just because the LAST hop is loopback.
    const res = await h(new Request('http://test.local/api/scan/current', {
      headers: { 'x-forwarded-for': '1.2.3.4, 127.0.0.1' },
    }))
    expect(res.status).toBe(401)
  })

  it('ignores X-Forwarded-For when trust-proxy is OFF (header spoofing protection)', async () => {
    const h = mountGated({ apiToken: TOKEN, localBypass: true, trustProxy: false })
    // With trust-proxy off the header is ignored; without a socket
    // remoteAddress in the test rig, getClientIp returns null →
    // isLoopback is false → no bypass.
    const res = await h(new Request('http://test.local/api/scan/current', {
      headers: { 'x-forwarded-for': '127.0.0.1' },
    }))
    expect(res.status).toBe(401)
  })
})
