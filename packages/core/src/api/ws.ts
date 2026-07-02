import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'
import { createTaggedLogger } from '../logger'

const log = createTaggedLogger('ws')

export class WS {
  private wss: WebSocketServer
  constructor() {
    this.wss = new WebSocketServer({ noServer: true })
    const wss = this.wss
    wss.on('connection', () => {
      log.debug(`Client connected (total: ${wss.clients?.size ?? 0})`)
    })
  }

  serve(req: IncomingMessage) {
    this.handleUpgrade(req, req.socket)
  }

  handleUpgrade(request: IncomingMessage, socket: Socket) {
    const wss = this.wss
    // ws.handleUpgrade requires a Buffer for the head; use the Node global
    // (this module is Node-only — node:http/node:net — and never browser-bundled).
    return wss.handleUpgrade(request, socket, Buffer.alloc(0), (client: WebSocket) => {
      wss.emit('connection', client, request)
      client.on('close', () => {
        log.debug(`Client disconnected (remaining: ${wss.clients?.size ?? 0})`)
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
      catch (err) {
        log.debug(`broadcast ${data.event} failed for one client`, err)
      }
    }
    log.debug(`broadcast ${data.event} → ${sent}/${clientCount} clients`)
  }
}

export function createWS(): WS {
  return new WS()
}
