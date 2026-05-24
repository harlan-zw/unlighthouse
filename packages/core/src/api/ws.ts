import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { WebSocket } from 'ws'
import { Buffer } from 'node:buffer'
import { WebSocketServer } from 'ws'
import { createTaggedLogger } from '../logger'

const log = createTaggedLogger('ws')

export class WS {
  private wss: WebSocketServer
  constructor() {
    this.wss = new WebSocketServer({ noServer: true })
    this.wss.on('connection', () => {
      log.debug(`Client connected (total: ${this.wss.clients.size})`)
    })
  }

  serve(req: IncomingMessage) {
    this.handleUpgrade(req, req.socket)
  }

  handleUpgrade(request: IncomingMessage, socket: Socket) {
    return this.wss.handleUpgrade(request, socket, Buffer.alloc(0), (client: WebSocket) => {
      this.wss.emit('connection', client, request)
      client.on('close', () => {
        log.debug(`Client disconnected (remaining: ${this.wss.clients.size})`)
      })
    })
  }

  broadcast(data: Record<string, unknown>) {
    const clientCount = this.wss.clients?.size ?? 0
    if (clientCount === 0) {
      log.debug(`broadcast ${data.event} — no clients`)
      return
    }
    const jsonData = JSON.stringify(data)
    let sent = 0
    for (const client of this.wss.clients ?? []) {
      try {
        client.send(jsonData)
        sent++
      }
      catch {}
    }
    log.debug(`broadcast ${data.event} → ${sent}/${clientCount} clients`)
  }
}

export function createWS(): WS {
  return new WS()
}
