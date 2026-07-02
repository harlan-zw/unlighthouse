// D-043 — local API hardening guards.
// Two required regression tests (per the pivot ship gate):
//   1. DNS-rebinding / cross-origin: a cross-origin Origin header → 403.
//   2. /__launch traversal: a `file` that escapes `root` → 403.
// Plus thorough unit coverage of the pure decision helpers.

import {
  checkApiOrigin,
  checkWsUpgrade,
  isExposedHost,
  isLoopbackHostname,
  normaliseOrigin,
  resolveLaunchPath,
} from '../packages/unlighthouse/src/server-guards'
import { createApiOriginGate } from '../packages/unlighthouse/src/server'
import { createApp, defineEventHandler, getQuery, setResponseStatus, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'

const LOCAL = 'http://localhost:5678'
const SITE = 'https://example.com'

// Default the local posture to trusting loopback origins (the CLI default);
// individual tests override trustLoopbackOrigin to exercise the locked-down path.
function chk(input: Partial<Parameters<typeof checkApiOrigin>[0]> & Pick<Parameters<typeof checkApiOrigin>[0], 'host' | 'origin' | 'referer'>) {
  return checkApiOrigin({ siteOrigin: null, exposed: false, trustLoopbackOrigin: true, ...input })
}

describe('checkApiOrigin — enumerated allow/reject rules', () => {
  it('allows no Origin + no Referer (non-browser client: curl / CI)', () => {
    const d = chk({ host: 'localhost:5678', origin: null, referer: null, siteOrigin: SITE, exposed: false })
    expect(d._tag).toBe('allow')
  })

  it('allows same-origin (Origin host === Host)', () => {
    const d = chk({ host: 'localhost:5678', origin: LOCAL, referer: null, siteOrigin: null, exposed: false })
    expect(d._tag).toBe('allow')
    expect(d.reason).toBe('same-origin')
  })

  it('allows the configured site origin (embedding)', () => {
    const d = chk({ host: 'localhost:5678', origin: SITE, referer: null, siteOrigin: SITE, exposed: false })
    expect(d._tag).toBe('allow')
    expect(d.reason).toBe('configured site origin')
  })

  it('rejects a cross-origin request (CSRF)', () => {
    const d = chk({ host: 'localhost:5678', origin: 'http://evil.com', referer: null, siteOrigin: SITE, exposed: false })
    expect(d._tag).toBe('reject')
  })

  it('allows a loopback origin on a different port (UI dev server)', () => {
    const d = chk({ host: 'localhost:5678', origin: 'http://localhost:3002', referer: null, siteOrigin: null, exposed: false })
    expect(d).toEqual({ _tag: 'allow', reason: 'loopback origin' })
  })

  it('allows a 127.0.0.1 alias origin of a localhost-hosted dashboard', () => {
    const d = chk({ host: 'localhost:5678', origin: 'http://127.0.0.1:5678', referer: null, siteOrigin: null, exposed: false })
    expect(d._tag).toBe('allow')
  })

  it('rejects a loopback origin when the deployment is locked down (token / pinned CORS)', () => {
    // A cross-port local page passes in the default posture but must NOT once
    // the operator sets a token or pins CORS origins.
    const locked = chk({ host: 'localhost:5678', origin: 'http://localhost:3002', trustLoopbackOrigin: false })
    expect(locked._tag).toBe('reject')
    // Same-origin and the configured site origin still pass when locked down.
    expect(chk({ host: 'localhost:5678', origin: LOCAL, trustLoopbackOrigin: false })._tag).toBe('allow')
    expect(chk({ host: 'localhost:5678', origin: SITE, siteOrigin: SITE, trustLoopbackOrigin: false }).reason).toBe('configured site origin')
  })

  it('still rejects a rebinding page Origin (attacker hostname is never loopback)', () => {
    // Host header carries the loopback value, but the page's Origin keeps the
    // attacker hostname the browser loaded it from.
    const d = chk({ host: 'localhost:5678', origin: 'http://attacker.example', referer: null, siteOrigin: null, exposed: false })
    expect(d._tag).toBe('reject')
  })

  it('rejects a registrable domain that merely starts with `127.` (not a loopback literal)', () => {
    // `127.example.com` textually starts with `127.` but is an attacker-owned
    // domain; the loopback allowance must not accept it as an Origin.
    expect(isLoopbackHostname('127.example.com')).toBe(false)
    const d = chk({ host: 'localhost:5678', origin: 'http://127.example.com', referer: null, siteOrigin: null, exposed: false })
    expect(d._tag).toBe('reject')
  })

  it('accepts a full 127.0.0.0/8 literal but rejects out-of-range octets', () => {
    expect(isLoopbackHostname('127.3.2.1')).toBe(true)
    expect(isLoopbackHostname('127.0.0.999')).toBe(false)
    expect(isLoopbackHostname('1270.0.0.1')).toBe(false)
  })

  it('rejects an opaque `null` Origin (sandboxed iframe / file: CSRF vector)', () => {
    // A sandboxed iframe or file: page sends the literal string `null`; that is
    // a browser hiding its origin, not an absent-Origin non-browser client.
    const d = chk({ host: 'localhost:5678', origin: 'null', referer: null, siteOrigin: null, exposed: false })
    expect(d._tag).toBe('reject')
  })

  it('rejects an untrusted Host on a loopback bind (DNS-rebinding)', () => {
    // attacker.example resolved to 127.0.0.1; Origin === Host would read as
    // same-origin, but the Host itself is untrusted → reject.
    const d = chk({ host: 'attacker.example', origin: 'http://attacker.example', referer: null, siteOrigin: SITE, exposed: false })
    expect(d._tag).toBe('reject')
    expect(d.reason).toContain('untrusted Host')
  })

  it('falls back to the Referer when Origin is absent (cross-origin → reject)', () => {
    const d = chk({ host: 'localhost:5678', origin: null, referer: 'http://evil.com/page', siteOrigin: null, exposed: false })
    expect(d._tag).toBe('reject')
  })

  it('falls back to the Referer when Origin is absent (same-origin → allow)', () => {
    const d = chk({ host: 'localhost:5678', origin: null, referer: `${LOCAL}/dashboard`, siteOrigin: null, exposed: false })
    expect(d._tag).toBe('allow')
  })

  it('relaxes the Host check when explicitly exposed, but still rejects cross-origin', () => {
    // exposed=true (--host 0.0.0.0): a LAN/tunnel Host is accepted...
    const lan = chk({ host: '192.168.1.20:5678', origin: 'http://192.168.1.20:5678', referer: null, siteOrigin: null, exposed: true })
    expect(lan._tag).toBe('allow')
    // ...but a genuinely cross-origin request is still rejected.
    const xo = chk({ host: '192.168.1.20:5678', origin: 'http://evil.com', referer: null, siteOrigin: null, exposed: true })
    expect(xo._tag).toBe('reject')
  })

  it('accepts 127.0.0.1 and ::1 loopback Hosts', () => {
    expect(chk({ host: '127.0.0.1:5678', origin: 'http://127.0.0.1:5678', referer: null, siteOrigin: null, exposed: false })._tag).toBe('allow')
    expect(chk({ host: '[::1]:5678', origin: 'http://[::1]:5678', referer: null, siteOrigin: null, exposed: false })._tag).toBe('allow')
  })
})

describe('host / origin classification helpers', () => {
  it('isLoopbackHostname', () => {
    expect(isLoopbackHostname('localhost')).toBe(true)
    expect(isLoopbackHostname('127.0.0.1')).toBe(true)
    expect(isLoopbackHostname('127.5.5.5')).toBe(true)
    expect(isLoopbackHostname('::1')).toBe(true)
    expect(isLoopbackHostname('[::1]')).toBe(true)
    expect(isLoopbackHostname('evil.com')).toBe(false)
    expect(isLoopbackHostname('0.0.0.0')).toBe(false)
    expect(isLoopbackHostname(null)).toBe(false)
  })

  it('isExposedHost', () => {
    expect(isExposedHost(undefined)).toBe(false)
    expect(isExposedHost('127.0.0.1')).toBe(false)
    expect(isExposedHost('localhost')).toBe(false)
    expect(isExposedHost('0.0.0.0')).toBe(true)
    expect(isExposedHost('::')).toBe(true)
    expect(isExposedHost('192.168.1.5')).toBe(true)
  })

  it('normaliseOrigin', () => {
    expect(normaliseOrigin('http://localhost:5678/x?y=1')).toBe('http://localhost:5678')
    expect(normaliseOrigin('not a url')).toBe(null)
    expect(normaliseOrigin(null)).toBe(null)
  })
})

describe('checkWsUpgrade — WS handshake gate', () => {
  const base = { wsPath: '/api/ws', siteOrigin: null, exposed: false, trustLoopbackOrigin: true }

  it('allows the WS path with a same-origin handshake', () => {
    const d = checkWsUpgrade({ ...base, reqPath: '/api/ws', host: 'localhost:5678', origin: LOCAL, referer: null })
    expect(d._tag).toBe('allow')
  })

  it('allows the loopback UI dev server in the default posture', () => {
    const d = checkWsUpgrade({ ...base, reqPath: '/api/ws', host: 'localhost:5678', origin: 'http://localhost:3002', referer: null })
    expect(d._tag).toBe('allow')
  })

  it('rejects an upgrade on any other path', () => {
    const d = checkWsUpgrade({ ...base, reqPath: '/api/scan/start', host: 'localhost:5678', origin: LOCAL, referer: null })
    expect(d._tag).toBe('reject')
    expect(d.reason).toContain('path')
  })

  it('rejects a cross-origin handshake (a remote page opening the event stream)', () => {
    const d = checkWsUpgrade({ ...base, reqPath: '/api/ws', host: 'localhost:5678', origin: 'http://evil.com', referer: null })
    expect(d._tag).toBe('reject')
  })

  it('rejects a loopback handshake once the deployment is locked down', () => {
    const d = checkWsUpgrade({ ...base, trustLoopbackOrigin: false, reqPath: '/api/ws', host: 'localhost:5678', origin: 'http://localhost:3002', referer: null })
    expect(d._tag).toBe('reject')
  })
})

describe('resolveLaunchPath — traversal constraint', () => {
  const ROOT = '/home/user/project'

  it('rejects a ../ traversal escape', () => {
    expect(resolveLaunchPath(ROOT, '../../etc/passwd')._tag).toBe('reject')
  })

  it('rejects an absolute path outside root', () => {
    expect(resolveLaunchPath(ROOT, '/etc/passwd')._tag).toBe('reject')
  })

  it('rejects a same-prefix sibling (project-evil is not inside project)', () => {
    expect(resolveLaunchPath(ROOT, '/home/user/project-evil/secret')._tag).toBe('reject')
  })

  it('allows an in-root relative path', () => {
    const r = resolveLaunchPath(ROOT, 'pages/index.vue')
    expect(r._tag).toBe('ok')
    expect(r.target).toBe('/home/user/project/pages/index.vue')
  })

  it('allows an in-root absolute path', () => {
    const r = resolveLaunchPath(ROOT, '/home/user/project/pages/index.vue')
    expect(r._tag).toBe('ok')
    expect(r.target).toBe('/home/user/project/pages/index.vue')
  })

  it('preserves the editor :line:column suffix and still constrains the path', () => {
    const ok = resolveLaunchPath(ROOT, '/home/user/project/pages/index.vue:12:5')
    expect(ok._tag).toBe('ok')
    expect(ok.target).toBe('/home/user/project/pages/index.vue:12:5')
    // suffix must not let a traversal through
    expect(resolveLaunchPath(ROOT, '../../../etc/passwd:1:1')._tag).toBe('reject')
  })
})

// ── App-level: the actual h3 gate via toWebHandler ───────────────────────────

function mountGate(opts: { siteOrigin?: string | null, exposed?: boolean } = {}): (req: Request) => Promise<Response> {
  const app = createApp()
  app.use(createApiOriginGate({
    apiBase: '/api',
    siteOrigin: opts.siteOrigin ?? SITE,
    exposed: opts.exposed ?? false,
  }))
  // A /__launch handler mirroring server.ts (returns JSON instead of launching
  // so the test never spawns a real editor).
  app.use('/api/__launch', defineEventHandler((event) => {
    const { file } = getQuery(event) as { file: string }
    const r = resolveLaunchPath('/home/user/project', file)
    if (r._tag === 'reject') {
      setResponseStatus(event, 403)
      return { error: 'forbidden' }
    }
    return { launched: r.target }
  }))
  app.use(defineEventHandler(() => ({ ok: true })))
  return toWebHandler(app)
}

const HOST = 'localhost:5678'

describe('createApiOriginGate — DNS-rebinding regression (required)', () => {
  it('rejects a cross-origin Origin header with 403', async () => {
    const h = mountGate()
    const res = await h(new Request(`${LOCAL}/api/scan/start`, {
      method: 'POST',
      headers: { host: HOST, origin: 'http://evil.com' },
    }))
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('forbidden')
  })

  it('rejects an untrusted Host (DNS-rebind) with 403 even when Origin === Host', async () => {
    const h = mountGate()
    const res = await h(new Request(`${LOCAL}/api/scan/start`, {
      method: 'POST',
      headers: { host: 'attacker.example', origin: 'http://attacker.example' },
    }))
    expect(res.status).toBe(403)
  })

  it('allows a same-origin request', async () => {
    const h = mountGate()
    const res = await h(new Request(`${LOCAL}/api/scan/current`, {
      headers: { host: HOST, origin: LOCAL },
    }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
  })

  it('allows a no-Origin request (curl / CI)', async () => {
    const h = mountGate()
    const res = await h(new Request(`${LOCAL}/api/scan/current`, { headers: { host: HOST } }))
    expect(res.status).toBe(200)
  })

  it('allows the configured site origin', async () => {
    const h = mountGate()
    const res = await h(new Request(`${LOCAL}/api/scan/current`, {
      headers: { host: HOST, origin: SITE },
    }))
    expect(res.status).toBe(200)
  })

  it('leaves non-/api paths untouched', async () => {
    const h = mountGate()
    const res = await h(new Request(`${LOCAL}/index.html`, {
      headers: { host: HOST, origin: 'http://evil.com' },
    }))
    expect(res.status).toBe(200)
  })
})

describe('/__launch — traversal regression (required)', () => {
  it('rejects a ../ traversal with 403', async () => {
    const h = mountGate()
    const res = await h(new Request(`${LOCAL}/api/__launch?file=${encodeURIComponent('../../etc/passwd')}`, {
      headers: { host: HOST, origin: LOCAL },
    }))
    expect(res.status).toBe(403)
  })

  it('allows an in-root file', async () => {
    const h = mountGate()
    const res = await h(new Request(`${LOCAL}/api/__launch?file=${encodeURIComponent('/home/user/project/pages/index.vue')}`, {
      headers: { host: HOST, origin: LOCAL },
    }))
    expect(res.status).toBe(200)
    expect((await res.json()).launched).toBe('/home/user/project/pages/index.vue')
  })
})
