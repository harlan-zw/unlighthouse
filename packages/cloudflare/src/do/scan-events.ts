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
import { logOperationalWarn } from '@unlighthouse/contracts/logging'

interface SubscriberFilter {
  /** Event names to keep (`scan:created`, `scan:complete`, …). Omitted = all. */
  events?: string[]
  /** Match the inbound event's `payload.scanId`. Omitted = all scans. */
  scanId?: string
}

interface RawEvent {
  event: string
  payload?: { scanId?: string }
  data?: { scanId?: string }
}

type WebSocketResponseInit = Omit<ResponseInit, 'webSocket'> & {
  webSocket: CFWebSocket
}

type WebSocketResponseConstructor = new (
  body?: BodyInit | null,
  init?: WebSocketResponseInit,
) => Response

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
  catch (_err) {
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

function closeWebSocket(ws: CFWebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason)
  }
  catch (err) {
    logOperationalWarn('cloudflare.websocket_close_failed', err, { code, reason })
  }
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
        const event = await request.json().catch((err) => {
          logOperationalWarn('cloudflare.scan_events_invalid_payload', err)
          return null
        }) as RawEvent | null
        if (!event || typeof event.event !== 'string')
          return new Response('invalid event payload', { status: 400 })
        if (!event.data && event.payload)
          event.data = event.payload
        if (!event.payload && event.data)
          event.payload = event.data
        if (event && typeof event.event === 'string')
          this.fanout(event)
        return new Response(null, { status: 204 })
      }
      return new Response('expected websocket upgrade', { status: 426 })
    }

    // WebSocketPair is a Workers-runtime global. @cloudflare/workers-types
    // only exposes it via /// <reference />, which our tsconfig doesn't
    // pull in. Cast via globalThis to keep the call site type-safe.
    const pair = new (globalThis as unknown as { WebSocketPair: new () => [CFWebSocket, CFWebSocket] }).WebSocketPair()
    const client = pair[0] as CFWebSocket
    const server = pair[1] as CFWebSocket

    // Hibernation-friendly accept: server stays attached without keeping
    // the DO alive between events.
    this.state.acceptWebSocket(server)

    const WorkerResponse = Response as unknown as WebSocketResponseConstructor
    return new WorkerResponse(null, {
      status: 101,
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
      catch (err) {
        logOperationalWarn('cloudflare.websocket_send_failed', err, {
          event: event.event,
          scanId: event.payload?.scanId ?? event.data?.scanId,
        })
        closeWebSocket(ws, 1011, 'send failed')
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
    closeWebSocket(ws, code, 'closing')
  }

  webSocketError(ws: CFWebSocket, _err: unknown): void {
    closeWebSocket(ws, 1011, 'error')
  }
}
