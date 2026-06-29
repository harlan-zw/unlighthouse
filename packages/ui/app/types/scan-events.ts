import type { ScanId, ScanStatus } from '@unlighthouse/contracts'

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
    error?: string
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
    error?: string
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
  dispose: () => void
}

export interface WsEnvelope {
  event: string
  data: unknown
}

export type UiScanStatus = ScanStatus | 'idle'
