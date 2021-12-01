import type { IncomingMessage } from 'http'
import type { Socket } from 'node:net'
import WebSocket from 'ws'
import { useUnlighthouse } from '../core/unlighthouse'

export const createBroadcastingEvents = () => {
  const { hooks, ws } = useUnlighthouse()

  hooks.hook('task-started', (path, response) => {
    ws.broadcast({ response })
  })
  hooks.hook('task-complete', (path, response) => {
    ws.broadcast({ response })
  })
  hooks.hook('task-added', (path, response) => {
    ws.broadcast({ response })
  })
}

export class WS {
  private wss: WebSocket.Server
  constructor() {
    this.wss = new WebSocket.Server({ noServer: true })
  }

  serve(req: IncomingMessage) {
    this.handleUpgrade(req, req.socket)
  }

  handleUpgrade(request: IncomingMessage, socket: Socket) {
    return this.wss.handleUpgrade(request, socket, Buffer.alloc(0), (client: WebSocket) => {
      this.wss.emit('connection', client, request)
    })
  }

  /**
     * Publish event and data to all connected clients
     * @param {object} data
     */
  broadcast(data: Record<string, any>) {
    const jsonData = JSON.stringify(data)

    for (const client of this.wss.clients) {
      try {
        client.send(jsonData)
      }
      catch (err) {
        // Ignore error (if client not ready to receive event)
      }
    }
  }
}
