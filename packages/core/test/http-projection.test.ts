// Unit tests for the HTTP projection (createHttpRouter).
// Spins the router up via h3 toWebHandler and asserts:
//   * each command has a registered route
//   * happy-path GET (scan.current) responds correctly
//   * handler throws map to UnlighthouseError code → HTTP status
//   * input validation failures return 400 with INPUT_INVALID

import type { CrawlSession } from '@unlighthouse/contracts'
import type { HandlerCtx, HandlerMap } from '@unlighthouse/core/api/handlers'
import { commands, commandToRoute } from '@unlighthouse/contracts/commands'
import { UnlighthouseError, UnlighthouseErrorEnvelopeSchema } from '@unlighthouse/contracts/errors'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { createHttpRouter } from '@unlighthouse/core/api/http'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { createApp, toWebHandler } from 'h3'
import { describe, expect, it } from 'vitest'
import { testCore, testHandlerCtx, testScanId } from '../../../test/helpers/contracts'

function makeCtx(): HandlerCtx {
  const core = testCore({
    run: () => { throw new Error('boom-no-real-core') },
  })
  return testHandlerCtx(memoryStorage(), {
    core,
    auditors: { list: () => [{ name: 'mock', ok: true }] },
  })
}

function busySession(): CrawlSession {
  return {
    scanId: testScanId('busy'),
    events: (async function* () {})(),
    subscribe: () => () => {},
    replay: () => [],
    capabilities: { pausable: false },
    pause: async () => {},
    resume: async () => {},
    cancel: async () => {},
    state: () => 'scanning',
    stats: () => ({ discovered: 1, scanned: 0, failed: 0, total: 1 }),
    done: new Promise<Awaited<CrawlSession['done']>>(() => {}),
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
      const r = commandToRoute(cmd)
      expect(['GET', 'POST', 'PUT', 'DELETE']).toContain(r.method)
      expect(r.path.startsWith('/')).toBe(true)
    }
  })
})

describe('http projection — request handling', () => {
  it('gET /scan/current returns { scanId: null } when no session', async () => {
    const ctx = makeCtx()
    const handler = makeWebHandler(ctx)
    const res = await handler(new Request('http://x/scan/current'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ scanId: null })
  })

  it('pOST /scan/start surfaces a 500 INTERNAL envelope when core throws a non-Unlighthouse error', async () => {
    const ctx = makeCtx() // core.run() throws plain Error
    const handler = makeWebHandler(ctx)
    const res = await handler(new Request('http://x/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: 'https://example.com' }),
    }))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(UnlighthouseErrorEnvelopeSchema.safeParse(body).success).toBe(true)
    expect(body.error?.code).toBe('INTERNAL')
    expect(body.error?.statusCode).toBe(500)
  })

  it('pOST /scan/cancel with invalid input returns 400 INPUT_INVALID', async () => {
    const ctx = makeCtx()
    const handler = makeWebHandler(ctx)
    const res = await handler(new Request('http://x/scan/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}), // missing scanId
    }))
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(UnlighthouseErrorEnvelopeSchema.safeParse(body).success).toBe(true)
    expect(body.error?.code).toBe('INPUT_INVALID')
    expect(body.error?.details?.issues).toEqual(body.error?.issues)
    expect(Array.isArray(body.error?.issues)).toBe(true)
  })

  it('unlighthouseError code → HTTP status mapping (SCAN_NOT_FOUND → 404)', async () => {
    // Use a real handler that's known to throw SCAN_NOT_FOUND on missing scan.
    const ctx = makeCtx()
    const handler = makeWebHandler(ctx)
    const res = await handler(new Request('http://x/scan/status?scanId=missing'))
    expect(res.status).toBe(404)
    const body = await res.json()
    expect(UnlighthouseErrorEnvelopeSchema.safeParse(body).success).toBe(true)
    expect(body.error?.code).toBe('SCAN_NOT_FOUND')
    expect(body.error?.statusCode).toBe(404)
  })

  it('unlighthouseError code → HTTP status mapping (ACTIVE_SCAN_CONFLICT → 409)', async () => {
    // Inject a stub core whose session() returns a fake in-flight session so
    // scan.start throws ACTIVE_SCAN_CONFLICT.
    const ctx = makeCtx()
    ctx.core = testCore({ session: () => busySession() })
    const handler = makeWebHandler(ctx)
    const res = await handler(new Request('http://x/scan/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ site: 'https://example.com' }),
    }))
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error?.code).toBe('ACTIVE_SCAN_CONFLICT')
    expect(body.error?.statusCode).toBe(409)
  })

  it('nOT_SUPPORTED maps to 501 via a hand-injected handler', async () => {
    // We hijack the manifest handler with one that throws NOT_SUPPORTED to
    // exercise the 501 branch without depending on capability flags.
    const handlers = createHandlers()
    handlers.manifest = {
      command: commands.manifest,
      run: async () => {
        throw new UnlighthouseError({
          code: 'NOT_SUPPORTED',
          message: 'nope',
          suggestion: 'Use a supported transport.',
          docsUrl: 'https://unlighthouse.dev/',
        })
      },
    }
    const handler = makeWebHandler(makeCtx(), handlers)
    const res = await handler(new Request('http://x/manifest'))
    expect(res.status).toBe(501)
    const body = await res.json()
    expect(body.error?.code).toBe('NOT_SUPPORTED')
    expect(body.error?.suggestion).toBe('Use a supported transport.')
    expect(body.error?.docsUrl).toBe('https://unlighthouse.dev/')
  })
})
