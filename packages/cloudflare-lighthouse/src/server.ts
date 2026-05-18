// Node-side HTTP server inside the Cloudflare Container.
//
// One route: POST /audit { url, config? } → Lighthouse Report JSON.
// Plus GET /health for the Container runtime's liveness probe.
//
// Auth: Authorization: Bearer ${SHARED_AUDIT_TOKEN} (validated constant-time-ish
// via a string comparison — Node v22 doesn't ship `timingSafeEqual` for
// strings without the buffer dance; we're behind the DO binding anyway so
// the threat model is "defence in depth" not "first auth boundary").
//
// Browser delivery: Cloudflare Browser Run's external CDP endpoint
//   wss://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}
//     /browser-rendering/devtools/browser?keep_alive=600000
// authenticated with Authorization: Bearer ${CF_BROWSER_RUN_TOKEN}.
//
// The keep_alive=600000 (10 min max per Browser Run limits) keeps Cloudflare's
// Chromium warm across audits. cdp-connect.ts disconnects (not closes) the
// puppeteer client after each audit, so the underlying browser stays alive.

import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import process from 'node:process'
import { createCdpConnectAuditor } from '@unlighthouse/core/auditors/cdp-connect'
import {
  createApp,
  createRouter,
  defineEventHandler,
  getHeader,
  readBody,
  toNodeListener,
} from 'h3'

// Log immediately so a crash before the listener still surfaces in
// Cloudflare's Container stdout stream.
// eslint-disable-next-line no-console
console.log('[cloudflare-lighthouse] boot starting; node', process.versions.node)

process.on('uncaughtException', (err) => {
  // eslint-disable-next-line no-console
  console.error('[cloudflare-lighthouse] uncaught:', err?.stack ?? err)
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  // eslint-disable-next-line no-console
  console.error('[cloudflare-lighthouse] unhandled:', reason)
  process.exit(1)
})

function required(name: string): string {
  const v = process.env[name]
  if (!v)
    throw new Error(`[cloudflare-lighthouse] missing env var ${name}`)
  return v
}

const PORT = Number(process.env.PORT ?? 8080)
const SHARED_AUDIT_TOKEN = required('SHARED_AUDIT_TOKEN')
const CF_ACCOUNT_ID = required('CF_ACCOUNT_ID')
const CF_BROWSER_RUN_TOKEN = required('CF_BROWSER_RUN_TOKEN')

const BROWSER_RUN_WS = `wss://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`
  + `/browser-rendering/devtools/browser?keep_alive=600000`

// Constant-time-ish bearer compare. Lengths must match before timingSafeEqual.
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length)
    return false
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  // eslint-disable-next-line ts/no-require-imports
  const { timingSafeEqual } = require('node:crypto') as typeof import('node:crypto')
  return timingSafeEqual(ab, bb)
}

const auditor = createCdpConnectAuditor({
  browserWSEndpoint: BROWSER_RUN_WS,
  headers: { Authorization: `Bearer ${CF_BROWSER_RUN_TOKEN}` },
})

const app = createApp()
const router = createRouter()

router.get(
  '/health',
  defineEventHandler(() => ({
    ok: true,
    service: 'unlighthouse-lighthouse',
    node: process.versions.node,
  })),
)

router.post(
  '/audit',
  defineEventHandler(async (event) => {
    const expectedAuth = `Bearer ${SHARED_AUDIT_TOKEN}`
    const auth = getHeader(event, 'authorization') ?? ''
    if (!constantTimeEqual(auth, expectedAuth)) {
      event.node.res.statusCode = 401
      return { error: 'unauthorized' }
    }

    const body = await readBody<{
      url?: string
      config?: Record<string, unknown>
      device?: 'mobile' | 'desktop'
    }>(event)

    if (!body?.url || typeof body.url !== 'string') {
      event.node.res.statusCode = 400
      return { error: 'url required' }
    }

    try {
      return await auditor.audit(body.url, undefined, {
        device: body.device,
        lighthouseConfig: body.config,
      })
    }
    catch (err) {
      event.node.res.statusCode = 502
      // eslint-disable-next-line no-console
      console.error('[cloudflare-lighthouse] audit failed:', err)
      return {
        error: 'audit_failed',
        detail: err instanceof Error ? err.message : String(err),
      }
    }
  }),
)

app.use(router)

// Bind explicitly to 0.0.0.0 so the Cloudflare Container's network namespace
// (10.0.0.1 from the launcher's POV) can reach the listener. The default
// listen() implicitly binds to 0.0.0.0 on Node, but a few Container runtime
// variants default to localhost-only which the Worker-side TCP probe can't
// reach.
createServer(toNodeListener(app)).listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`[cloudflare-lighthouse] listening on 0.0.0.0:${PORT}`)
})
