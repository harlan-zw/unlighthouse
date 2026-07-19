// Shared event forwarder: builds an `EmitFn` that POSTs each hook event to the
// matching ScanEventsDO (keyed by scanId), exactly like the hooks.afterEach
// bridge in app hosts. Used by ScanWorkflow lifecycle steps and delegated route
// audits so durable orchestration and audit results feed the same live stream.

import type { EmitFn } from '@unlighthouse/core/runtime'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'

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
  const emit: EmitFn = async (event, payload) => {
    try {
      await stub.fetch('https://scan-events/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ event, payload }),
      })
    }
    catch (err) {
      logOperationalWarn('cloudflare.scan_event_fanout_failed', err, { scanId, event })
    }
  }
  return emit
}
