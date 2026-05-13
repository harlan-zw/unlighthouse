// Unit tests for the HTTP projection (createHttpRouter).
// Spins the router up via h3 toWebHandler and asserts:
//   * each command has a registered route
//   * happy-path GET (scan.current) responds correctly
//   * handler throws map to UnlighthouseError code → HTTP status
//   * input validation failures return 400 with INPUT_INVALID

import type { Auditor, Storage, UnlighthouseConfig, UnlighthouseCore } from '@unlighthouse/contracts'
import type { HandlerCtx, HandlerMap } from '@unlighthouse/core/api/handlers/types'
import { commands, UnlighthouseError } from '@unlighthouse/contracts'
import { commandToRoute, createHttpRouter } from '@unlighthouse/core/api/http'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createMockAuditor } from '@unlighthouse/core/auditors/mock'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { createApp, defineEventHandler, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'

function makeCtx(): HandlerCtx {
  const core = {
    run: () => { throw new Error('boom-no-real-core') },
    session: () => null,
  } as unknown as UnlighthouseCore
  return {
    core,
    auditor: createMockAuditor() as Auditor,
    storage: memoryStorage() as Storage,
    config: { site: 'https://example.com', scanner: { device: 'mobile', throttle: true } } as UnlighthouseConfig,
    auditors: { list: () => [{ name: 'mock', ok: true }] },
  }
}

function makeWebHandler(ctx: HandlerCtx, handlers: HandlerMap = createHandlers()): (req: Request) => Promise<Response> {
  const router = createHttpRouter({ handlers, ctx })
  const app = createApp()
  app.use(router)
  return toWebHandler(app)
}

describe('http projection — route table', () => {
  it('every command resolves to a method + path', () => {
    for (const cmd of Object.values(commands)) {
      const r = commandToRoute(cmd as any)
      expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(r.method)
      expect(r.path.startsWith('/')).toBe(true)
    }
  })
})

describe('http projection — request handling', () => {
  it('GET /scan/current returns { scanId: null } when no session', async () => {
    const ctx = makeCtx()
    const handler = makeWebHandler(ctx)
    const res = await handler(new Request('http://x/scan/current'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ scanId: null })
  })

  it('POST /scan/start surfaces a 500 INTERNAL_ERROR when core throws a non-Unlighthouse error', async () => {
    const ctx = makeCtx() // core.run() throws plain Error
    const handler = makeWebHandler(ctx)
    const res = await handler(new Request('http://x/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: 'https://example.com' }),
    }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error?.code).toBe('INTERNAL_ERROR')
  })

  it('POST /scan/cancel with invalid input returns 400 INPUT_INVALID', async () => {
    const ctx = makeCtx()
    const handler = makeWebHandler(ctx)
    const res = await handler(new Request('http://x/scan/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // missing scanId
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error?.code).toBe('INPUT_INVALID')
    expect(Array.isArray(body.error?.issues)).toBe(true)
  })

  it('UnlighthouseError code → HTTP status mapping (SCAN_NOT_FOUND → 404)', async () => {
    // Use a real handler that's known to throw SCAN_NOT_FOUND on missing scan.
    const ctx = makeCtx()
    const handler = makeWebHandler(ctx)
    const res = await handler(new Request('http://x/scan/status?scanId=missing'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(body.error?.code).toBe('SCAN_NOT_FOUND')
  })

  it('UnlighthouseError code → HTTP status mapping (ACTIVE_SCAN_CONFLICT → 409)', async () => {
    // Inject a stub core whose session() returns a fake in-flight session so
    // scan.start throws ACTIVE_SCAN_CONFLICT.
    const ctx = makeCtx()
    ;(ctx as any).core.session = () => ({ scanId: 'busy' })
    const handler = makeWebHandler(ctx)
    const res = await handler(new Request('http://x/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: 'https://example.com' }),
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error?.code).toBe('ACTIVE_SCAN_CONFLICT')
  })

  it('NOT_SUPPORTED maps to 501 via a hand-injected handler', async () => {
    // We hijack the manifest handler with one that throws NOT_SUPPORTED to
    // exercise the 501 branch without depending on capability flags.
    const handlers = createHandlers()
    ;(handlers as any).manifest = {
      command: {},
      run: async () => {
        throw new UnlighthouseError({ code: 'NOT_SUPPORTED', message: 'nope' })
      },
    }
    const handler = makeWebHandler(makeCtx(), handlers)
    const res = await handler(new Request('http://x/manifest'))
    expect(res.status).toBe(501)
    const body = await res.json()
    expect(body.error?.code).toBe('NOT_SUPPORTED')
  })
})
