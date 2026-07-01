// Node-side HTTP server inside the Cloudflare Container.
//
// One route: POST /audit { url, config? } → Lighthouse Report JSON.
// Plus GET /health for the Container runtime's liveness probe.
//
// Auth: Authorization: Bearer ${SHARED_AUDIT_TOKEN} (validated constant-time-ish
// via a string comparison — `timingSafeEqual` works on buffers, not strings,
// and we're behind the DO binding anyway so
// the threat model is "defence in depth" not "first auth boundary").
//
// Browser delivery: Cloudflare Browser Run's external CDP endpoint
//   wss://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}
//     /browser-rendering/devtools/browser?keep_alive=${KEEP_ALIVE_MS}
// authenticated with Authorization: Bearer ${CF_BROWSER_RUN_TOKEN}.
//
// COST: keep_alive is the idle window a Browser Run session stays alive (and
// BILLED) after the client detaches. cdp-connect.ts now CLOSES the browser
// after each audit, which terminates the session immediately — so keep_alive is
// only a safety net for a failed close. It used to be 600000 (10 min) paired
// with disconnect()-not-close(), which billed every ~30s audit for the full
// 10-min window (~20x) and stacked up to ~87 Browser-Run hours. Keep it just
// above a single audit's duration. Overridable via CF_BROWSER_KEEP_ALIVE_MS.

import type { Auditor } from '@unlighthouse/contracts/ports'
import { Buffer } from 'node:buffer'
import { createServer } from 'node:http'
import process from 'node:process'
import { logOperationalError, logOperationalWarn } from '@unlighthouse/contracts/logging'
import {
  createApp,
  createRouter,
  defineEventHandler,
  getHeader,
  readBody,
  toNodeListener,
} from 'h3'

// Heavy auditor module (lighthouse + puppeteer-core, ~5 MB of top-level
// code with Chrome runtime probing) is imported lazily on first /audit
// call. Importing it at module load delays the listen() call by enough
// that Cloudflare Container's TCP probe gives up before the port opens.
async function loadAuditor(): Promise<typeof import('@unlighthouse/core/auditors/cdp-connect').createCdpConnectAuditor> {
  const mod = await import('@unlighthouse/core/auditors/cdp-connect')
  return mod.createCdpConnectAuditor
}

// Log immediately so a crash before the listener still surfaces in
// Cloudflare's Container stdout stream.
// eslint-disable-next-line no-console
console.log('[cloudflare-lighthouse] boot starting; node', process.versions.node, 'arch', process.arch, 'platform', process.platform)

process.on('uncaughtException', (err) => {
  logOperationalError('cloudflare_lighthouse.uncaught_exception', err, {}, console)
})
process.on('unhandledRejection', (reason) => {
  logOperationalError('cloudflare_lighthouse.unhandled_rejection', reason, {}, console)
})

// Graceful shutdown — Cloudflare's launcher sends SIGTERM when the
// Container hibernates (sleepAfter). Match the official containers-template
// convention so the listener closes cleanly instead of being SIGKILL'd.
function installShutdown(closeFn: () => Promise<void>): void {
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => {
      // eslint-disable-next-line no-console
      console.log(`[cloudflare-lighthouse] received ${sig}; closing`)
      closeFn().finally(() => process.exit(0))
    })
  }
}

// Env vars are required for /audit to actually do anything, but we want
// /health to come up even if they're missing — that way the Container
// reports as listening and the Worker-side fallback can take over
// gracefully on /audit calls.
const PORT = Number(process.env.PORT ?? 8080)
const SHARED_AUDIT_TOKEN = process.env.SHARED_AUDIT_TOKEN ?? ''
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID ?? ''
const CF_BROWSER_RUN_TOKEN = process.env.CF_BROWSER_RUN_TOKEN ?? ''

if (!SHARED_AUDIT_TOKEN || !CF_ACCOUNT_ID || !CF_BROWSER_RUN_TOKEN) {
  logOperationalWarn('cloudflare_lighthouse.config_missing', null, {
    missing: [
      !SHARED_AUDIT_TOKEN ? 'SHARED_AUDIT_TOKEN' : null,
      !CF_ACCOUNT_ID ? 'CF_ACCOUNT_ID' : null,
      !CF_BROWSER_RUN_TOKEN ? 'CF_BROWSER_RUN_TOKEN' : null,
    ].filter(Boolean),
  }, console)
}

// Idle window before Browser Run reaps (and stops billing) a detached session.
// Default 60s — comfortably above one audit, far below the old 600s. We close()
// after each audit anyway, so this only bounds the bill if a close() is lost.
const KEEP_ALIVE_MS = Number(process.env.CF_BROWSER_KEEP_ALIVE_MS ?? 60000)
const BROWSER_RUN_WS = `wss://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}`
  + `/browser-rendering/devtools/browser?keep_alive=${KEEP_ALIVE_MS}`

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

// Build the auditor lazily on first /audit so the server can listen()
// immediately. We intentionally don't await this at boot — Cloudflare's
// probe needs the TCP listener up in ~5s, and lighthouse + puppeteer-core
// take longer than that to load on a cold container.
let auditorPromise: Promise<Auditor> | null = null
const auditorConfigured = !!(SHARED_AUDIT_TOKEN && CF_ACCOUNT_ID && CF_BROWSER_RUN_TOKEN)

async function getAuditor(): Promise<Auditor> {
  if (!auditorPromise) {
    auditorPromise = loadAuditor().then(create => create({
      browserWSEndpoint: BROWSER_RUN_WS,
      headers: { Authorization: `Bearer ${CF_BROWSER_RUN_TOKEN}` },
    }))
  }
  return auditorPromise
}

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
    if (!auditorConfigured) {
      event.node.res.statusCode = 503
      return { error: 'auditor_not_configured', detail: 'Container is missing required env vars' }
    }
    const expectedAuth = `Bearer ${SHARED_AUDIT_TOKEN}`
    const auth = getHeader(event, 'authorization') ?? ''
    if (!constantTimeEqual(auth, expectedAuth)) {
      event.node.res.statusCode = 401
      return { error: 'unauthorized' }
    }

    const body = await readBody<{
      url?: string
      config?: Record<string, unknown>
      flags?: Record<string, unknown>
      device?: 'mobile' | 'desktop'
    }>(event)

    if (!body?.url || typeof body.url !== 'string') {
      event.node.res.statusCode = 400
      return { error: 'url required' }
    }

    try {
      const auditor = await getAuditor()
      return await auditor.audit(body.url, undefined, {
        device: body.device,
        lighthouseConfig: body.config,
        lighthouseFlags: body.flags,
      })
    }
    catch (err) {
      event.node.res.statusCode = 502

      logOperationalError('cloudflare_lighthouse.audit_failed', err, { url: body.url }, console)
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
const server = createServer(toNodeListener(app))
server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`[cloudflare-lighthouse] listening on 0.0.0.0:${PORT}`)
})
server.on('error', (err) => {
  logOperationalError('cloudflare_lighthouse.server_error', err, { port: PORT }, console)
})

installShutdown(() => new Promise<void>((resolve) => {
  server.close(() => resolve())
}))
