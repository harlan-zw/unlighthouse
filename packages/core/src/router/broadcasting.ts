import type { IncomingMessage } from 'node:http'
import type { Socket } from 'node:net'
import { Buffer } from 'node:buffer'
import { WebSocketServer } from 'ws'
import { useUnlighthouse } from '../unlighthouse'

let broadcastingHooksRegistered = false

/**
 * When certain hooks are triggered we need to broadcast data via the web socket.
 */
export function createBroadcastingEvents() {
  const { hooks, ws, worker } = useUnlighthouse()

  // ws may not be set, for example in a CI environment
  if (!ws)
    return

  if (broadcastingHooksRegistered)
    return

  broadcastingHooksRegistered = true

  // Broadcast progress updates
  const broadcastProgress = () => {
    const stats = worker.monitor()
    const reports = worker.reports()
    const completedReports = reports.filter(r => r.report?.score !== undefined)

    ws.broadcast({
      event: 'scan:progress',
      data: {
        discovered: reports.length,
        scanned: completedReports.length,
        total: stats.allTargets,
        percent: Number.parseFloat(stats.donePercStr),
        timeRemaining: stats.timeRemaining > 0 ? stats.timeRemaining : null,
      },
    })
  }

  hooks.hook('task-started', (path, response) => {
    if (response.tasks.inspectHtmlTask === 'completed')
      ws.broadcast({ response })
  })
  hooks.hook('task-complete', (path, response, taskName) => {
    if (response.tasks.inspectHtmlTask === 'completed')
      ws.broadcast({ response })

    // Broadcast route completion for live feed
    if (taskName === 'runLighthouseTask' && response.report) {
      ws.broadcast({
        event: 'scan:route-complete',
        data: {
          path: response.route.path,
          score: response.report.score || 0,
          categories: response.report.categories,
        },
      })
      broadcastProgress()
    }
  })
  hooks.hook('task-added', (path, response) => {
    if (response.tasks.inspectHtmlTask === 'completed')
      ws.broadcast({ response })
    broadcastProgress()
  })
  hooks.hook('worker-finished', () => {
    const stats = worker.monitor()
    const reports = worker.reports()
    const completedReports = reports.filter(r => r.report?.score !== undefined)
    const avgScore = completedReports.length > 0
      ? completedReports.reduce((sum, r) => sum + (r.report?.score || 0), 0) / completedReports.length
      : 0

    ws.broadcast({
      event: 'scan:complete',
      data: {
        totalRoutes: reports.length,
        scannedRoutes: completedReports.length,
        avgScore: Math.round(avgScore),
        timeElapsed: stats.timeRunning,
      },
    })
  })

  hooks.hook('worker-cancelled', () => {
    ws.broadcast({
      event: 'scan:cancelled',
      data: {
        message: 'Scan cancelled',
      },
    })
  })

  hooks.hook('worker-error', (error) => {
    ws.broadcast({
      event: 'scan:error',
      data: {
        message: error.message,
      },
    })
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
