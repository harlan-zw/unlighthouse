// Wire payloads for transport:* hooks emitted by the WebSocket bridge.
// Owned by contracts so both the UI plugin and the backend broadcaster
// agree on the shape.

export interface ScanProgress {
  discovered: number
  scanned: number
  failed: number
  total: number
  percent: number
}

export interface CompletedRoute {
  path: string
  score: number
  categories?: Record<string, { score: number, title: string }>
}
