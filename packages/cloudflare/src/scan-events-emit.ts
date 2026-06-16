// Shared event forwarder: builds an `EmitFn` that POSTs each hook event to the
// matching ScanEventsDO (keyed by scanId), exactly like the hooks.afterEach
// bridge in app.ts. Used by ScanRunnerDO (init/progress/finalize events) and by
// the worker's internal /__scan/audit route (per-route audit events) so both
// the durable scheduler and the delegated audit feed the same live WS stream.

import type { DurableObjectNamespace } from '@cloudflare/workers-types'
import type { EmitFn } from '@unlighthouse/core'

interface ScanEventsEnv {
  SCAN_EVENTS_DO: DurableObjectNamespace
}

/**
 * Returns an EmitFn that fire-and-forgets `{event, payload}` to
 * SCAN_EVENTS_DO.idFromName(scanId). Errors are swallowed — failing to fan out
 * a live event must never break the scan.
 */
export function scanEventsEmit(env: ScanEventsEnv, scanId: string): EmitFn {
  const id = env.SCAN_EVENTS_DO.idFromName(scanId)
  const stub = env.SCAN_EVENTS_DO.get(id)
  return (async (event: string, payload: unknown): Promise<void> => {
    try {
      await stub.fetch('https://scan-events/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event, payload }),
      })
    }
    catch {
      // best-effort; a dropped fan-out shouldn't fail the audit/finalize.
    }
  }) as EmitFn
}
