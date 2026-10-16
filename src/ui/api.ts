import type { ScanComparison } from '../analysis/compare.ts'
import type { ScanSummary } from '../analysis/summary.ts'
import type { BrokenLink, IssueDetail, IssueQuery, Paged, PageQuery, TemplateCount } from '../contracts.ts'
import type { UnlighthouseEvent } from '../events.ts'
import type { Device, Issue, Page, Scan, ScanStatus } from '../types.ts'
import type { PageDetail, SiteListItem } from './shapes.ts'

export interface Operations {
  'sites.list': { input: Record<string, never>, output: SiteListItem[] }
  'scans.list': { input: { origin?: string, status?: ScanStatus, limit: number, offset: number }, output: Paged<Scan> }
  'scans.start': { input: { site: string, devices: Device[] }, output: Scan }
  'scans.get': { input: { scanId: string }, output: Scan }
  'scans.cancel': { input: { scanId: string }, output: Scan }
  'scans.summary': { input: { scanId: string }, output: ScanSummary }
  'scans.brokenLinks': { input: { scanId: string }, output: BrokenLink[] }
  'scans.templates': { input: { scanId: string }, output: TemplateCount[] }
  'pages.list': { input: PageQuery, output: Paged<Page> }
  'pages.get': { input: { scanId: string, url: string, device: Device }, output: PageDetail }
  'issues.list': { input: IssueQuery, output: Paged<Issue> }
  'issues.get': { input: { scanId: string, auditId: string }, output: IssueDetail }
  'compare': { input: { base: string, head: string }, output: ScanComparison }
}

export type Operation = keyof Operations
export type Input<K extends Operation> = Operations[K]['input']
export type Output<K extends Operation> = Operations[K]['output']

export type ConnectionState = 'connecting' | 'open' | 'closed'

export interface Client {
  readonly mode: 'live' | 'mock' | 'static'
  call<K extends Operation>(operation: K, input: Input<K>): Promise<Output<K>>
  reportUrl(scanId: string, device: Device, url: string): string | null
  subscribe(scanId: string, listener: (event: UnlighthouseEvent) => void): () => void
  onConnection(listener: (state: ConnectionState) => void): () => void
}

export class ApiError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.code = code
  }
}

type Envelope<T> = { ok: true, data: T } | { ok: false, error: { code: string, message: string } }

export function reportUrl(scanId: string, device: Device, url: string): string {
  return `/report/${encodeURIComponent(scanId)}/${device}?url=${encodeURIComponent(url)}`
}

export function createHttpClient(base = ''): Client {
  const listeners = new Map<string, Set<(event: UnlighthouseEvent) => void>>()
  const connectionListeners = new Set<(state: ConnectionState) => void>()
  let socket: WebSocket | null = null
  let retry = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  let state: ConnectionState = 'closed'

  function setState(next: ConnectionState): void {
    state = next
    for (const listener of connectionListeners)
      listener(next)
  }

  function send(message: unknown): void {
    if (socket?.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify(message))
  }

  function connect(): void {
    if (socket || listeners.size === 0)
      return
    const url = new URL(`${base}/ws`, location.href)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(url)
    socket = ws
    setState('connecting')
    ws.addEventListener('open', () => {
      retry = 0
      setState('open')
      for (const scanId of listeners.keys())
        send({ subscribe: scanId })
    })
    ws.addEventListener('message', (message) => {
      let event: UnlighthouseEvent
      try {
        event = JSON.parse(String(message.data)) as UnlighthouseEvent
      }
      catch {
        return
      }
      const scanId = 'scanId' in event ? event.scanId : undefined
      if (!scanId)
        return
      for (const listener of listeners.get(scanId) ?? [])
        listener(event)
    })
    ws.addEventListener('close', () => {
      socket = null
      setState('closed')
      if (listeners.size === 0)
        return
      const delay = Math.min(30_000, 500 * 2 ** retry++)
      timer = setTimeout(() => {
        timer = null
        connect()
      }, delay)
    })
  }

  return {
    mode: 'live',
    reportUrl,
    async call(operation, input) {
      const response = await fetch(`${base}/api/${operation}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      })
      let body: Envelope<never>
      try {
        body = await response.json() as Envelope<never>
      }
      catch {
        throw new ApiError('INTERNAL', `${operation} failed with HTTP ${response.status}`)
      }
      if (!body.ok)
        throw new ApiError(body.error.code, body.error.message)
      return body.data
    },
    subscribe(scanId, listener) {
      let set = listeners.get(scanId)
      if (!set) {
        set = new Set()
        listeners.set(scanId, set)
        send({ subscribe: scanId })
      }
      set.add(listener)
      connect()
      return () => {
        const current = listeners.get(scanId)
        current?.delete(listener)
        if (current?.size === 0) {
          listeners.delete(scanId)
          send({ unsubscribe: scanId })
        }
        if (listeners.size === 0) {
          if (timer)
            clearTimeout(timer)
          timer = null
          socket?.close()
        }
      }
    },
    onConnection(listener) {
      connectionListeners.add(listener)
      listener(state)
      return () => connectionListeners.delete(listener)
    },
  }
}
