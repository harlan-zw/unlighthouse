// D-043 — SSRF policy hook on the Cloudflare host.
//
// `createCloudflareApp({ allowedTargets })` vets a caller-supplied `scan.start`
// `site` before any scan work starts. A multi-tenant deploy MUST supply it to
// stop the Worker being turned into an SSRF proxy at internal addresses. Core
// stays policy-free; this is a host option, defaulting to allow-all.
//
// The rejection path returns 403 before touching the rate-limiter / runner DOs,
// so a minimal env (D1 + R2 + stub DO namespaces) exercises it end-to-end.

import type { CloudflareEnv } from '../src/app'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createCloudflareApp } from '../src/app'
import { createTestD1, createTestR2 } from './helpers/d1-better-sqlite3'

const execCtx = { waitUntil() {}, passThroughOnException() {} } as unknown as ExecutionContext

// A rate-limiter DO namespace stub whose `fetch` returns a fixed decision, so
// the "allowed" path (which proceeds past the policy gate to the limiter) has a
// deterministic terminal status without wiring a real Durable Object.
function rateLimiterStub(decision: { ok: boolean, resetAt: number }): DurableObjectNamespace {
  return {
    idFromName: () => ({}),
    get: () => ({
      fetch: async () => new Response(JSON.stringify(decision), { headers: { 'content-type': 'application/json' } }),
    }),
  } as unknown as DurableObjectNamespace
}

function buildEnv(rateLimiter: DurableObjectNamespace): CloudflareEnv {
  return {
    DB: createTestD1().db,
    BLOBS: createTestR2(),
    SCAN_EVENTS_DO: {} as unknown as DurableObjectNamespace,
    RATE_LIMITER_DO: rateLimiter,
    // SCAN_RUNNER_DO intentionally absent → after the limiter allows, the
    // legacy path falls through (never reached in these tests).
    UNLIGHTHOUSE_USE_MOCK_AUDITOR: '1',
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
    const app = createCloudflareApp(buildEnv(rateLimiterStub({ ok: true, resetAt: 0 })), { allowedTargets })

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
    const app = createCloudflareApp(env, { allowedTargets })

    const res = await app.fetch(scanStartReq('https://example.com'), env, execCtx)

    expect(allowedTargets).toHaveBeenCalledWith('https://example.com')
    expect(res.status).toBe(429)
  })

  it('defaults to allow-all when no hook is supplied', async () => {
    const env = buildEnv(rateLimiterStub({ ok: false, resetAt: Date.now() + 60_000 }))
    const app = createCloudflareApp(env, {})

    const res = await app.fetch(scanStartReq('http://169.254.169.254/'), env, execCtx)

    // No policy → not rejected by policy; proceeds to the limiter (429 here).
    expect(res.status).toBe(429)
  })
})
