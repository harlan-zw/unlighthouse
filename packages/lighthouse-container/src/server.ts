// Testable Node-side HTTP module for the Lighthouse audit container.
//
// The executable process/env/listen lifecycle lives in `entry.ts`. Keeping it
// out of this module makes the published `./server` subpath safe to import and
// lets tests exercise the HTTP interface without opening a real socket.

import type { Logger } from '@unlighthouse/contracts'
import type { Auditor, LighthouseAuditRequest } from '@unlighthouse/contracts/ports'
import { Buffer } from 'node:buffer'
import { timingSafeEqual } from 'node:crypto'
import { logOperationalError } from '@unlighthouse/contracts/logging'
import { parseLighthouseAuditRequest } from '@unlighthouse/contracts/ports'
import {
  createApp,
  createRouter,
  defineEventHandler,
  getHeader,
  readBody,
} from 'h3'

export interface CreateLighthouseContainerServerOptions {
  /** Bearer token shared with the Worker-side container auditor. */
  token: string
  /** Whether the entry resolved every environment value required by the auditor. */
  auditorConfigured: boolean
  /** Lazily resolves the real Lighthouse auditor on the first audit request. */
  getAuditor: () => Promise<Auditor>
  /** Node version reported by the health endpoint. */
  nodeVersion: string
  /** Operational logger; defaults to the process console. */
  logger?: Pick<Logger, 'warn' | 'error'>
}

function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.byteLength !== bb.byteLength)
    return false
  return timingSafeEqual(ab, bb)
}

export function createLighthouseContainerServer(opts: CreateLighthouseContainerServerOptions) {
  const logger = opts.logger ?? console
  const app = createApp()
  const router = createRouter()

  router.get(
    '/health',
    defineEventHandler(() => ({
      ok: true,
      service: 'unlighthouse-lighthouse',
      node: opts.nodeVersion,
    })),
  )

  router.post(
    '/audit',
    defineEventHandler(async (event) => {
      if (!opts.auditorConfigured) {
        event.node.res.statusCode = 503
        return { error: 'auditor_not_configured', detail: 'Container is missing required env vars' }
      }

      const auth = getHeader(event, 'authorization') ?? ''
      if (!constantTimeEqual(auth, `Bearer ${opts.token}`)) {
        event.node.res.statusCode = 401
        return { error: 'unauthorized' }
      }

      let body: LighthouseAuditRequest
      try {
        const rawBody: unknown = await readBody(event)
        body = parseLighthouseAuditRequest(rawBody)
      }
      catch {
        event.node.res.statusCode = 400
        return { error: 'invalid audit request' }
      }

      try {
        const auditor = await opts.getAuditor()
        return await auditor.audit(body.url, undefined, {
          device: body.device,
          lighthouseConfig: body.config,
          lighthouseFlags: body.flags,
        })
      }
      catch (err) {
        event.node.res.statusCode = 502
        logOperationalError('lighthouse_container.audit_failed', err, { url: body.url }, logger)
        return {
          error: 'audit_failed',
          detail: err instanceof Error ? err.message : String(err),
        }
      }
    }),
  )

  app.use(router)
  return app
}
