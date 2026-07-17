// D-043 — SSRF policy hook on the Cloudflare host.
//
// `createCloudflareApp({ allowedTargets })` vets a caller-supplied `scan.start`
// `site` before any scan work starts. A multi-tenant deploy MUST supply it to
// stop the Worker being turned into an SSRF proxy at internal addresses. Core
// stays policy-free; the host must always supply this policy.
//
// The rejection path returns 403 before touching the rate-limiter / runner DOs,
// so a minimal env (D1 + R2 + stub DO namespaces) exercises it end-to-end.

import type { CloudflareEnv, CreateCloudflareAppOptions } from '../apps/cloudflare/src/runtime'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCloudflareApp } from '../apps/cloudflare/src/runtime'
import { createTestD1, createTestR2 } from '../packages/cloudflare/test/helpers/d1-better-sqlite3'

const execCtx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

// A rate-limiter DO namespace stub whose `fetch` returns a fixed decision, so
// the "allowed" path (which proceeds past the policy gate to the limiter) has a
// deterministic terminal status without wiring a real Durable Object.
function rateLimiterStub(decision: { ok: boolean, resetAt: number }): CloudflareEnv['RATE_LIMITER_DO'] {
  return {
    getByName: () => ({
      consume: async () => ({
        ...decision,
        remaining: decision.ok ? 9 : 0,
        limit: 10,
      }),
    }),
  }
}

function appOptions(allowedTargets: CreateCloudflareAppOptions['allowedTargets']): CreateCloudflareAppOptions {
  return {
    allowedTargets,
    authenticate: async () => ({ principal: 'test-user' }),
    auditorFactory: () => createMockAuditor(),
  }
}

function buildEnv(rateLimiter: CloudflareEnv['RATE_LIMITER_DO']): CloudflareEnv {
  return {
    DB: createTestD1().db,
    BLOBS: createTestR2(),
    RATE_LIMITER_DO: rateLimiter,
    // The tests that pass the limiter stop before Workflow creation.
    SCAN_WORKFLOW: {} as CloudflareEnv['SCAN_WORKFLOW'],
  } as CloudflareEnv
}

function scanStartReq(site: string): Request {
  return new Request('https://worker.example/api/scan/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ site }),
  })
}

describe('createCloudflareApp — allowedTargets SSRF hook', () => {
  beforeEach(() => vi.restoreAllMocks())

  it('rejects a disallowed target with 403 before starting a scan', async () => {
    const allowedTargets = vi.fn((url: string) => !url.includes('169.254.169.254'))
    const app = createCloudflareApp(buildEnv(rateLimiterStub({ ok: true, resetAt: 0 })), appOptions(allowedTargets))

    const res = await app.fetch(scanStartReq('http://169.254.169.254/latest/meta-data'), buildEnv(rateLimiterStub({ ok: true, resetAt: 0 })), execCtx)

    expect(res.status).toBe(403)
    expect((await res.json() as { error: string }).error).toBe('forbidden')
    expect(allowedTargets).toHaveBeenCalledWith('http://169.254.169.254/latest/meta-data')
  })

  it('lets an allowed target through the policy gate (reaches the rate limiter)', async () => {
    const allowedTargets = vi.fn(() => true)
    // Limiter denies → 429. Reaching a 429 proves the policy gate passed the
    // request through (a policy rejection would have been a 403 first).
    const env = buildEnv(rateLimiterStub({ ok: false, resetAt: Date.now() + 60_000 }))
    const app = createCloudflareApp(env, appOptions(allowedTargets))

    const res = await app.fetch(scanStartReq('https://example.com'), env, execCtx)

    expect(allowedTargets).toHaveBeenCalledWith('https://example.com')
    expect(res.status).toBe(429)
  })

  it('authenticates before reaching host policy or the limiter', async () => {
    const env = buildEnv(rateLimiterStub({ ok: false, resetAt: Date.now() + 60_000 }))
    const allowedTargets = vi.fn(() => true)
    const app = createCloudflareApp(env, {
      ...appOptions(allowedTargets),
      authenticate: async () => null,
    })

    const res = await app.fetch(scanStartReq('https://example.com/'), env, execCtx)

    expect(res.status).toBe(401)
    expect(allowedTargets).not.toHaveBeenCalled()
  })

  it('authenticates before serving static dashboard assets', async () => {
    const env = buildEnv(rateLimiterStub({ ok: true, resetAt: 0 }))
    const fetchAsset = vi.fn(async () => new Response('<html>private</html>'))
    env.ASSETS = { fetch: fetchAsset } as Fetcher
    const app = createCloudflareApp(env, {
      ...appOptions(() => true),
      authenticate: async () => null,
    })

    const res = await app.fetch(new Request('https://worker.example/'), env, execCtx)

    expect(res.status).toBe(401)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(fetchAsset).not.toHaveBeenCalled()
  })

  it('marks authenticated dashboard assets private and uncacheable', async () => {
    const env = buildEnv(rateLimiterStub({ ok: true, resetAt: 0 }))
    env.ASSETS = {
      fetch: async () => new Response('<html>private</html>', {
        headers: { 'cache-control': 'public, max-age=31536000' },
      }),
    } as Fetcher
    const app = createCloudflareApp(env, appOptions(() => true))

    const res = await app.fetch(new Request('https://worker.example/'), env, execCtx)

    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('private, no-store')
  })
})
