import WebSocket from 'ws'
import {IncomingMessage} from "http"
import {Socket} from "node:net"

class WS {
    private wss: WebSocket.Server;
    constructor () {
        this.wss = new WebSocket.Server({ noServer: true })
    }

    serve (req: IncomingMessage) {
        this.handleUpgrade(req, req.socket, undefined)
    }

    handleUpgrade (request: IncomingMessage, socket: Socket, head = '') {
        return this.wss.handleUpgrade(request, socket, head, (client: WebSocket) => {
            this.wss.emit('connection', client, request)
        })
    }

    /**
     * Publish event and data to all connected clients
     * @param {object} data
     */
    broadcast (data : Record<string, any>) {
        const jsonData = JSON.stringify(data)

        for (const client of this.wss.clients) {
            try {
                client.send(jsonData)
            } catch (err) {
                // Ignore error (if client not ready to receive event)
            }
        }
    }
}

export default WS
