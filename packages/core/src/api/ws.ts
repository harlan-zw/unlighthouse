import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { WebSocket } from 'ws'
import { Buffer } from 'node:buffer'
import { WebSocketServer } from 'ws'

export class WS {
  private wss: WebSocketServer
  constructor() {
    this.wss = new WebSocketServer({ noServer: true })
  }

  serve(req: IncomingMessage) {
    this.handleUpgrade(req, req.socket)
  }

  handleUpgrade(request: IncomingMessage, socket: Socket) {
    return this.wss.handleUpgrade(request, socket, Buffer.alloc(0), (client: WebSocket) => {
      this.wss.emit('connection', client, request)
    })
  }

  /** Publish event + data to all connected clients. */
  broadcast(data: Record<string, unknown>) {
    const jsonData = JSON.stringify(data)
    for (const client of this.wss.clients ?? []) {
      try {
        client.send(jsonData)
      }
      catch {
        // client not ready; drop silently
      }
    }
  }
}
