import type { ScanId, ScanStatus } from '@unlighthouse/contracts'

export interface UiStructuredError {
  code: string
  message: string
  statusCode?: number
  category?: 'fatal' | 'route-failed' | 'retryable' | 'validation'
  retryable?: boolean
  suggestion?: string
  docsUrl?: string
  details?: Record<string, unknown>
}

export interface ScanEventPayloads {
  'scan:created': {
    scanId: ScanId
    site: string
    startedAt: string
  }
  'scan:started': undefined
  'scan:discovering': undefined
  'scan:scanning': {
    discovered?: number
  } | undefined
  'scan:progress': {
    discovered?: number
    scanned?: number
    failed?: number
    total?: number
  }
  'scan:route-complete': {
    url: string
    metrics?: {
      scorePerformance?: number | null
    }
  }
  'scan:route-failed': {
    url: string
    error?: string | UiStructuredError
  }
  'scan:paused': undefined
  'scan:resumed': undefined
  'scan:complete': {
    summary?: {
      routes?: number
    }
  } | undefined
  'scan:cancelled': {
    reason?: string
  } | undefined
  'scan:error': {
    error?: string | UiStructuredError
  } | undefined
  'log': {
    level?: 'info' | 'warn' | 'error' | string
    message: string
  }
  '*': {
    event: string
    data: unknown
  }
}

export type ScanEventName = keyof ScanEventPayloads
export type ScanLifecycleEventName = Exclude<ScanEventName, 'log' | '*'>
export type ScanEventHandler<K extends ScanEventName = ScanEventName> = (data: ScanEventPayloads[K]) => void

export interface ScanEventBus {
  on: <K extends ScanEventName>(event: K, fn: ScanEventHandler<K>) => void
  off: <K extends ScanEventName>(event: K, fn: ScanEventHandler<K>) => void
  /**
   * Subscribe to socket *re*connects (not the initial connect). Lets a
   * consumer recover events missed while the socket was down — e.g. drive
   * `useNuxtSubscription`'s `ctx.resync()`. Returns an unsubscribe fn.
   */
  onReconnect: (fn: () => void) => () => void
  dispose: () => void
}

export interface WsEnvelope {
  event: string
  data?: unknown
  payload?: unknown
}

export type UiScanStatus = ScanStatus | 'idle'
