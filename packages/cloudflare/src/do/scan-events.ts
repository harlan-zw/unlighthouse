// Per-scan event fan-out Durable Object with WebSocket hibernation.
// TODO(v5): wire into HandlerCtx hooks so emitted scan events route here.
//
// Class form is a Cloudflare Workers platform constraint (DO runtime expects classes).

import type {
  WebSocket as CFWebSocket,
  DurableObjectState,
} from '@cloudflare/workers-types'

export class ScanEventsDO {
  private state: DurableObjectState
  private env: unknown

  constructor(state: DurableObjectState, env: unknown) {
    this.state = state
    this.env = env
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get('Upgrade')
    if (upgrade !== 'websocket') {
      // TODO(v5): expose a POST /fanout RPC for handlers to push events.
      if (request.method === 'POST') {
        const event = await request.json().catch(() => null)
        if (event)
          this.fanout(event)
        return new Response(null, { status: 204 })
      }
      return new Response('expected websocket upgrade', { status: 426 })
    }

    // @ts-expect-error - WebSocketPair is a global in Workers runtime.
    const pair = new WebSocketPair()
    const client = pair[0] as CFWebSocket
    const server = pair[1] as CFWebSocket

    // Hibernation-friendly accept: server stays attached without keeping the DO alive.
    this.state.acceptWebSocket(server)

    return new Response(null, {
      status: 101,
      // @ts-expect-error - webSocket field is a Workers-specific Response option.
      webSocket: client,
    })
  }

  /** Broadcast an event to every attached websocket. */
  fanout(event: unknown): void {
    const payload = JSON.stringify(event)
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(payload)
      }
      catch {
        // Drop dead sockets silently; close handler will clean up.
      }
    }
  }

  // TODO(v5): respect client-supplied filters (events[], scanId match).
  webSocketMessage(ws: CFWebSocket, _message: ArrayBuffer | string): void {
    // For now subscribers are passive; ignore inbound frames.
    void ws
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
