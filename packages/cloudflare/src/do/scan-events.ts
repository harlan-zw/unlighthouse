// Per-scan event fan-out Durable Object with WebSocket hibernation.
//
// Two surfaces:
//   - WebSocket upgrade for subscribers. Hibernation-friendly accept
//     keeps the DO sleeping between events. Subscribers send a JSON
//     filter as their first frame (`{ events: [...], scanId: '...' }`);
//     subsequent events that match the filter get pushed.
//   - POST RPC for producers (`fetch(req)` with method=POST). The Worker
//     fetch handler calls this from the HandlerCtx hooks so emitted
//     events route into the fan-out without subscribers having to poll.
//
// Class form is a Cloudflare Workers platform constraint (DO runtime
// expects classes).

import type {
  WebSocket as CFWebSocket,
  DurableObjectState,
} from '@cloudflare/workers-types'

interface SubscriberFilter {
  /** Event names to keep (`scan:created`, `scan:complete`, …). Omitted = all. */
  events?: string[]
  /** Match the inbound event's `payload.scanId`. Omitted = all scans. */
  scanId?: string
}

interface RawEvent {
  event: string
  payload?: { scanId?: string }
}

function parseFilter(raw: string | ArrayBuffer): SubscriberFilter | null {
  try {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
    const parsed = JSON.parse(text) as Partial<SubscriberFilter>
    if (parsed == null || typeof parsed !== 'object')
      return null
    const out: SubscriberFilter = {}
    if (Array.isArray(parsed.events) && parsed.events.every(e => typeof e === 'string'))
      out.events = parsed.events
    if (typeof parsed.scanId === 'string')
      out.scanId = parsed.scanId
    return out
  }
  catch {
    return null
  }
}

function matches(filter: SubscriberFilter | undefined, ev: RawEvent): boolean {
  if (!filter)
    return true
  if (filter.events && !filter.events.includes(ev.event))
    return false
  if (filter.scanId && ev.payload?.scanId !== filter.scanId)
    return false
  return true
}

export class ScanEventsDO {
  private state: DurableObjectState
  private env: unknown
  // Filters survive hibernation via attached websocket serializable attachment.
  // We don't persist to DO storage — sockets reconnect on resume, and a
  // dropped filter just means "no filter" (subscriber sees everything until
  // it re-sends the filter frame).

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade')

    if (upgrade !== 'websocket') {
      // Producer RPC. POST a JSON event; we fan it out to every attached
      // socket whose filter accepts it. Used by the Worker fetch handler
      // to forward events emitted by HandlerCtx hooks.
      if (request.method === 'POST') {
        const event = await request.json().catch(() => null) as RawEvent | null
        if (event && typeof event.event === 'string')
          this.fanout(event)
        return new Response(null, { status: 204 })
      }
      return new Response('expected websocket upgrade', { status: 426 })
    }

    // @ts-expect-error - WebSocketPair is a global in Workers runtime.
    const pair = new WebSocketPair()
    const client = pair[0] as CFWebSocket
    const server = pair[1] as CFWebSocket

    // Hibernation-friendly accept: server stays attached without keeping
    // the DO alive between events.
    this.state.acceptWebSocket(server)

    return new Response(null, {
      status: 101,
      // @ts-expect-error - webSocket field is a Workers-specific Response option.
      webSocket: client,
    })
  }

  /** Broadcast an event to every attached websocket whose filter accepts it. */
  fanout(event: RawEvent): void {
    const payload = JSON.stringify(event)
    for (const ws of this.state.getWebSockets()) {
      const filter = ws.deserializeAttachment?.() as SubscriberFilter | undefined
      if (!matches(filter, event))
        continue
      try {
        ws.send(payload)
      }
      catch {
        // Drop dead sockets silently; close handler will clean up.
      }
    }
  }

  // First inbound frame is a filter JSON; later frames re-set the filter.
  // Anything that doesn't parse stays as the prior filter (no filter on a
  // brand-new socket = receive everything).
  webSocketMessage(ws: CFWebSocket, message: ArrayBuffer | string): void {
    const filter = parseFilter(message)
    if (filter)
      ws.serializeAttachment?.(filter)
  }

  webSocketClose(ws: CFWebSocket, code: number, _reason: string, _wasClean: boolean): void {
    try {
      ws.close(code, 'closing')
    }
    catch {}
  }

  webSocketError(ws: CFWebSocket, _err: unknown): void {
    try {
      ws.close(1011, 'error')
    }
    catch {}
  }
}
