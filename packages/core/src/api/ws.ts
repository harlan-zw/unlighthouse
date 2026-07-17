import type { Logger } from '@unlighthouse/contracts'
import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import type { WebSocket } from 'ws'
import { WebSocketServer } from 'ws'

export class WS {
  private wss: WebSocketServer
  private logger?: Logger

  constructor(logger?: Logger) {
    this.logger = logger?.withTag('ws')
    this.wss = new WebSocketServer({ noServer: true })
    const wss = this.wss
    wss.on('connection', () => {
      this.logger?.debug(`Client connected (total: ${wss.clients?.size ?? 0})`)
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
        this.logger?.debug(`Client disconnected (remaining: ${wss.clients?.size ?? 0})`)
      })
    })
  }

  broadcast(data: Record<string, unknown>) {
    const clientCount = this.wss.clients?.size ?? 0
    if (clientCount === 0) {
      this.logger?.debug(`broadcast ${data.event} — no clients`)
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
        this.logger?.debug(`broadcast ${data.event} failed for one client`, err)
      }
    }
    this.logger?.debug(`broadcast ${data.event} → ${sent}/${clientCount} clients`)
  }
}

export function createWS(logger?: Logger): WS {
  return new WS(logger)
}
