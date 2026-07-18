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

import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { DurableObject } from 'cloudflare:workers'

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isScanReference(value: unknown): value is { scanId?: string } {
  return isRecord(value) && (value.scanId === undefined || typeof value.scanId === 'string')
}

function isRawEvent(value: unknown): value is RawEvent {
  return isRecord(value)
    && typeof value.event === 'string'
    && (value.payload === undefined || isScanReference(value.payload))
    && (value.data === undefined || isScanReference(value.data))
}

function subscriberFilter(value: unknown): SubscriberFilter | null {
  if (!isRecord(value))
    return null
  const out: SubscriberFilter = {}
  if (Array.isArray(value.events) && value.events.every(e => typeof e === 'string'))
    out.events = value.events
  else if (value.events !== undefined)
    return null
  if (typeof value.scanId === 'string')
    out.scanId = value.scanId
  else if (value.scanId !== undefined)
    return null
  return out
}

type WebSocketResponseInit = Omit<ResponseInit, 'webSocket'> & {
  webSocket: WebSocket
}

type WebSocketResponseConstructor = new (
  body?: BodyInit | null,
  init?: WebSocketResponseInit,
) => Response

function parseFilter(raw: string | ArrayBuffer): SubscriberFilter | null {
  try {
    const text = typeof raw === 'string' ? raw : new TextDecoder().decode(raw)
    const parsed: unknown = JSON.parse(text)
    return subscriberFilter(parsed)
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

function closeWebSocket(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason)
  }
  catch (err) {
    logOperationalWarn('cloudflare.websocket_close_failed', err, { code, reason })
  }
}

export class ScanEventsDO extends DurableObject<unknown> {
  private state: DurableObjectState
  // Filters survive hibernation via attached websocket serializable attachment.
  // We don't persist to DO storage — sockets reconnect on resume, and a
  // dropped filter just means "no filter" (subscriber sees everything until
  // it re-sends the filter frame).

  constructor(state: DurableObjectState, env: unknown) {
    super(state, env)
    this.state = state
  }

  override async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade')

    if (upgrade !== 'websocket') {
      // Producer RPC. POST a JSON event; we fan it out to every attached
      // socket whose filter accepts it. Used by the Worker fetch handler
      // to forward events emitted by HandlerCtx hooks.
      if (request.method === 'POST') {
        const event: unknown = await request.json().catch((err) => {
          logOperationalWarn('cloudflare.scan_events_invalid_payload', err)
          return null
        })
        if (!isRawEvent(event))
          return new Response('invalid event payload', { status: 400 })
        if (!event.data && event.payload)
          event.data = event.payload
        if (!event.payload && event.data)
          event.payload = event.data
        this.fanout(event)
        return new Response(null, { status: 204 })
      }
      return new Response('expected websocket upgrade', { status: 426 })
    }

    // WebSocketPair is a Workers-runtime global. Hibernation keeps these
    // sockets attached without pinning the object in memory.
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]

    // Hibernation-friendly accept: server stays attached without keeping
    // the DO alive between events.
    this.state.acceptWebSocket(server)

    // Workers extends ResponseInit with `webSocket` and permits status 101;
    // lib.dom's constructor omits both, so isolate that platform type gap here.
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
      const filter = subscriberFilter(ws.deserializeAttachment?.()) ?? undefined
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
  override webSocketMessage(ws: WebSocket, message: ArrayBuffer | string): void {
    const filter = parseFilter(message)
    if (filter)
      ws.serializeAttachment?.(filter)
  }

  override webSocketClose(ws: WebSocket, code: number, _reason: string, _wasClean: boolean): void {
    closeWebSocket(ws, code, 'closing')
  }

  override webSocketError(ws: WebSocket, _err: unknown): void {
    closeWebSocket(ws, 1011, 'error')
  }
}
