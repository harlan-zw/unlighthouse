import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import { Buffer } from 'node:buffer'
import { WebSocketServer } from 'ws'
import { useUnlighthouse } from '../unlighthouse'

/**
 * When certain hooks are triggered we need to broadcast data via the web socket.
 */
export function createBroadcastingEvents() {
  const { hooks, ws } = useUnlighthouse()

  // ws may not be set, for example in a CI environment
  if (!ws)
    return

  hooks.hook('task-started', (path, response) => {
    if (response.tasks.inspectHtmlTask === 'completed')
      ws.broadcast({ response })
  })
  hooks.hook('task-complete', (path, response) => {
    if (response.tasks.inspectHtmlTask === 'completed')
      ws.broadcast({ response })
  })
  hooks.hook('task-added', (path, response) => {
    if (response.tasks.inspectHtmlTask === 'completed')
      ws.broadcast({ response })
  })
}

export class WS {
  private wss: WebSocketServer
  constructor() {
    this.wss = new WebSocketServer({ noServer: true })
  }

  serve(req: IncomingMessage) {
    this.handleUpgrade(req, req.socket)
  }

  handleUpgrade(request: IncomingMessage, socket: Socket) {
    return this.wss.handleUpgrade(request, socket, Buffer.alloc(0), (client) => {
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
      catch {
        // Ignore error (if client not ready to receive event)
      }
    }
  }
}
