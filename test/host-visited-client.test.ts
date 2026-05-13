// End-to-end regression for `behavior.autoStartOnVisit`.
//
// Before this fix `host.ts` passed a dummy hookable to `mountServer`
// (`{ callHook: async () => {} }`), so the `visited-client` event the SPA
// root route fires went to /dev/null. `autoStartOnVisit` was a tracked-
// but-ignored flag.
//
// Test strategy:
//   - real `createUnlighthouseHost` (no module mocks)
//   - real h3 app on a real ephemeral HTTP port
//   - real `fetch` against `GET /`
//   - `host.start` is overwritten with a spy; `host.ts` calls it via
//     `result.start()` indirection so the override is honoured
//
// If `host.ts` regresses to the dummy hookable, the autoStart spy is never
// called and the autoStartOnVisit=true assertions fail.

import type { Server } from 'node:http'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createApp, toNodeListener } from 'h3'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { createUnlighthouseHost } from 'unlighthouse'

interface HostFixture {
  server: Server
  baseUrl: string
  start: ReturnType<typeof vi.fn>
}

async function bootHost(opts: { autoStartOnVisit: boolean }): Promise<HostFixture> {
  const root = mkdtempSync(join(tmpdir(), 'unl-host-'))
  const outputPath = join(root, '.unlighthouse')

  const host = await createUnlighthouseHost({
    userConfig: {
      site: 'https://example.com',
      root,
      outputPath,
      cache: false,
    },
    behavior: { ws: null, autoStartOnVisit: opts.autoStartOnVisit },
  })

  // Spy on start — host.ts captures `result.start` via indirection, so this
  // override is what autoStartOnVisit will actually call.
  const startSpy = vi.fn(async () => ({ scanId: 'spy' }))
  host.start = startSpy

  const app = createApp()
  const server = createServer(toNodeListener(app))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const addr = server.address()
  const port = typeof addr === 'object' && addr ? addr.port : 0
  const baseUrl = `http://127.0.0.1:${port}`

  await host.setServerContext({ url: `${baseUrl}/`, server, app })

  // host derives generatedClientPath inside setServerContext. Drop an
  // index.html there so the SPA fallback returns 200 (the bug exists
  // regardless of body, but a real 200 makes the test reflect reality).
  const clientPath = host.runtimeSettings.generatedClientPath
  if (clientPath)
    writeFileSync(join(clientPath, 'index.html'), '<html>ok</html>')

  return { server, baseUrl, start: startSpy }
}

describe('autoStartOnVisit — end-to-end (real host + real HTTP)', () => {
  describe('when behavior.autoStartOnVisit = true', () => {
    let fx: HostFixture
    beforeAll(async () => { fx = await bootHost({ autoStartOnVisit: true }) })
    afterAll(async () => { await new Promise(r => fx.server.close(() => r(null))) })

    it('GET / triggers host.start() exactly once', async () => {
      await fetch(`${fx.baseUrl}/`)
      expect(fx.start).toHaveBeenCalledTimes(1)
    })

    it('repeated visits do not trigger start() again (idempotent)', async () => {
      await fetch(`${fx.baseUrl}/`)
      await fetch(`${fx.baseUrl}/some/spa/route`)
      await fetch(`${fx.baseUrl}/`)
      expect(fx.start).toHaveBeenCalledTimes(1)
    })
  })

  describe('when behavior.autoStartOnVisit = false', () => {
    let fx: HostFixture
    beforeAll(async () => { fx = await bootHost({ autoStartOnVisit: false }) })
    afterAll(async () => { await new Promise(r => fx.server.close(() => r(null))) })

    it('GET / does NOT trigger host.start()', async () => {
      await fetch(`${fx.baseUrl}/`)
      expect(fx.start).not.toHaveBeenCalled()
    })

    it('repeated visits still do not trigger start()', async () => {
      await fetch(`${fx.baseUrl}/`)
      await fetch(`${fx.baseUrl}/spa/route`)
      expect(fx.start).not.toHaveBeenCalled()
    })
  })
})
