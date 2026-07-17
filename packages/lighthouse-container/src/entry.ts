// Executable Node entry for the Lighthouse audit container.
//
// Browser delivery is runtime-configured through BROWSER_WS_ENDPOINT and an
// optional BROWSER_WS_TOKEN. The Cloudflare preset supplies its Browser Run
// endpoint, but the image itself is not tied to that control plane.
//
// The auditor closes the connected browser after every audit. Providers that
// support an idle timeout should encode it into BROWSER_WS_ENDPOINT as a safety
// net for a failed close; the Cloudflare adapter does this for Browser Run.

import type { Auditor } from '@unlighthouse/contracts/ports'
import { createServer } from 'node:http'
import process from 'node:process'
import { logOperationalError, logOperationalWarn } from '@unlighthouse/contracts/logging'
import { toNodeListener } from 'h3'
import { createLighthouseContainerServer } from './server'

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
console.log('[lighthouse-container] boot starting; node', process.versions.node, 'arch', process.arch, 'platform', process.platform)

process.on('uncaughtException', (err) => {
  logOperationalError('lighthouse_container.uncaught_exception', err, {}, console)
})
process.on('unhandledRejection', (reason) => {
  logOperationalError('lighthouse_container.unhandled_rejection', reason, {}, console)
})

// Graceful shutdown — Cloudflare's launcher sends SIGTERM when the
// Container hibernates (sleepAfter). Match the official containers-template
// convention so the listener closes cleanly instead of being SIGKILL'd.
function installShutdown(closeFn: () => Promise<void>): void {
  for (const sig of ['SIGTERM', 'SIGINT'] as const) {
    process.on(sig, () => {
      // eslint-disable-next-line no-console
      console.log(`[lighthouse-container] received ${sig}; closing`)
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
const BROWSER_WS_ENDPOINT = process.env.BROWSER_WS_ENDPOINT ?? ''
const BROWSER_WS_TOKEN = process.env.BROWSER_WS_TOKEN ?? ''

if (!SHARED_AUDIT_TOKEN || !BROWSER_WS_ENDPOINT) {
  logOperationalWarn('lighthouse_container.config_missing', null, {
    missing: [
      !SHARED_AUDIT_TOKEN ? 'SHARED_AUDIT_TOKEN' : null,
      !BROWSER_WS_ENDPOINT ? 'BROWSER_WS_ENDPOINT' : null,
    ].filter(Boolean),
  }, console)
}

// Build the auditor lazily on first /audit so the server can listen()
// immediately. We intentionally don't await this at boot — Cloudflare's
// probe needs the TCP listener up in ~5s, and lighthouse + puppeteer-core
// take longer than that to load on a cold container.
let auditorPromise: Promise<Auditor> | null = null
const auditorConfigured = !!(SHARED_AUDIT_TOKEN && BROWSER_WS_ENDPOINT)

async function getAuditor(): Promise<Auditor> {
  if (!auditorPromise) {
    auditorPromise = loadAuditor().then(create => create({
      browserWSEndpoint: BROWSER_WS_ENDPOINT,
      headers: BROWSER_WS_TOKEN ? { Authorization: `Bearer ${BROWSER_WS_TOKEN}` } : undefined,
    }))
  }
  return auditorPromise
}

const app = createLighthouseContainerServer({
  token: SHARED_AUDIT_TOKEN,
  auditorConfigured,
  getAuditor,
  nodeVersion: process.versions.node,
  logger: console,
})

// Bind explicitly to 0.0.0.0 so the Cloudflare Container's network namespace
// (10.0.0.1 from the launcher's POV) can reach the listener. The default
// listen() implicitly binds to 0.0.0.0 on Node, but a few Container runtime
// variants default to localhost-only which the Worker-side TCP probe can't
// reach.
const server = createServer(toNodeListener(app))
server.listen(PORT, '0.0.0.0', () => {
  // eslint-disable-next-line no-console
  console.log(`[lighthouse-container] listening on 0.0.0.0:${PORT}`)
})
server.on('error', (err) => {
  logOperationalError('lighthouse_container.server_error', err, { port: PORT }, console)
})

installShutdown(() => new Promise<void>((resolve) => {
  server.close(() => resolve())
}))
