import type { Server } from 'bun'
import { ReportGenerator } from 'lighthouse/report/generator/report-generator.js'
import { redactFlowReport, redactReport } from '../audit/reconcile.ts'
import type { Store } from '../contracts.ts'
import { UnlighthouseError, toErrorPayload } from '../errors.ts'
import type { ErrorCode } from '../errors.ts'
import type { EventBus } from '../events.ts'
import { operations as defaultOperations } from '../ops/operations.ts'
import type { AnyOperation, OperationContext } from '../ops/registry.ts'
import { invoke } from '../ops/registry.ts'
import type { Scanner } from '../scan/runner.ts'
import { DEVICES } from '../types.ts'
import type { Device } from '../types.ts'
import dashboard from '../ui/index.html'
import type { CsvFile } from './export.ts'
import { CSV_FILES, scanCsv } from './export.ts'
import { hostAllowed, hostnameOf, isLoopbackHost, LOOPBACK_HOSTS, originAllowed, randomToken, sessionCookie, tokenFromQuery, tokenMatches } from './security.ts'

export interface ServerOptions {
  store: Store
  scanner: Scanner
  bus: EventBus
  host?: string
  port?: number
  token?: string
  allowedHosts?: string[]
  operations?: AnyOperation[]
  development?: boolean
  scheduler?: OperationContext['scheduler']
  notifier?: OperationContext['notifier']
}

export interface UnlighthouseServer {
  url: string
  loginUrl: string
  token: string
  port: number
  host: string
  exposed: boolean
  stop(): Promise<void>
}

interface SocketData {
  topics: Set<string>
}

const DASHBOARD_PATH = '/__unlighthouse/dashboard.html'
const MAX_BODY_BYTES = 1024 * 1024
const MAX_TOPICS = 64

const STATUS: Partial<Record<ErrorCode | 'INTERNAL', number>> = {
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  INVALID_CONFIG: 400,
  SCAN_ACTIVE: 409,
  SCAN_NOT_RUNNING: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CHROME_NOT_FOUND: 503,
}

const NO_STORE = { 'cache-control': 'no-store' }

const REPORT_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
  'referrer-policy': 'no-referrer',
  ...NO_STORE,
}

function failure(code: ErrorCode | 'INTERNAL', message: string, status = STATUS[code] ?? 500): Response {
  return Response.json({ ok: false, error: { code, message } }, { status, headers: NO_STORE })
}

function errorResponse(error: unknown): Response {
  const payload = toErrorPayload(error)
  return failure(payload.code, payload.message)
}

function topic(scanId: string): string {
  return `scan:${scanId}`
}

export function renderReport(gzipped: Uint8Array): string {
  const lhr = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(gzipped as Uint8Array<ArrayBuffer>)))
  return ReportGenerator.generateReportHtml(redactReport(lhr))
}

export function renderFlowReport(gzipped: Uint8Array): string {
  const flow = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(gzipped as Uint8Array<ArrayBuffer>)))
  return ReportGenerator.generateFlowReportHtml(redactFlowReport(flow))
}

export function createServer(options: ServerOptions): UnlighthouseServer {
  const { store, scanner, bus } = options
  const operations = options.operations ?? defaultOperations
  const host = options.host ?? '127.0.0.1'
  const token = options.token ?? process.env['UNLIGHTHOUSE_TOKEN'] ?? randomToken()
  const allowed = new Set([...LOOPBACK_HOSTS, ...(options.allowedHosts ?? []).map(name => hostnameOf(name) ?? name.toLowerCase())])
  const boundName = hostnameOf(host)
  if (boundName && boundName !== '0.0.0.0' && boundName !== '::')
    allowed.add(boundName)
  const development = options.development ?? false
  let cookieName = 'unlighthouse_token'
  let dashboardHtml: Promise<string> | null = null

  function guard(request: Request, needsOrigin: boolean): Response | null {
    if (!hostAllowed(request, allowed))
      return failure('FORBIDDEN', 'Host not allowed. Open Unlighthouse through 127.0.0.1 or localhost, or allow this host with --allow-host.', 403)
    if (needsOrigin && !originAllowed(request))
      return failure('FORBIDDEN', 'Cross-origin requests are not allowed', 403)
    if (!tokenMatches(request, token, cookieName))
      return failure('UNAUTHORIZED', 'Missing or invalid token. Open the URL printed by `unlighthouse serve` (it contains ?token=) or send Authorization: Bearer <token>.', 401)
    return null
  }

  function loadDashboard(server: Server<SocketData>): Promise<string> {
    if (dashboardHtml && !development)
      return dashboardHtml
    const loading = fetch(new URL(DASHBOARD_PATH, server.url)).then(async (response) => {
      if (!response.ok)
        throw new Error(`The dashboard bundle failed with HTTP ${response.status}`)
      return response.text()
    })
    loading.catch(() => {
      dashboardHtml = null
    })
    dashboardHtml = loading
    return loading
  }

  async function handleDashboard(request: Request, server: Server<SocketData>): Promise<Response> {
    if (!hostAllowed(request, allowed))
      return new Response('Host not allowed', { status: 403 })
    const url = new URL(request.url)
    const valid = tokenFromQuery(url, token)
    if (valid === false)
      return new Response('Invalid token. Use the URL printed by `unlighthouse serve`.', { status: 401, headers: { 'content-type': 'text/plain; charset=utf-8' } })
    if (valid) {
      url.searchParams.delete('token')
      return new Response(null, {
        status: 303,
        headers: { 'location': `${url.pathname}${url.search}`, 'set-cookie': sessionCookie(cookieName, token), ...NO_STORE },
      })
    }
    try {
      return new Response(await loadDashboard(server), {
        headers: { 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', ...NO_STORE },
      })
    }
    catch (error) {
      return new Response(`The dashboard could not be built: ${error instanceof Error ? error.message : String(error)}`, { status: 500 })
    }
  }

  async function handleApi(request: Request & { params: { operation: string } }): Promise<Response> {
    const denied = guard(request, true)
    if (denied)
      return denied
    if (request.method !== 'POST')
      return failure('INVALID_INPUT', 'Use POST with a JSON body', 405)
    const length = Number(request.headers.get('content-length') ?? 0)
    if (length > MAX_BODY_BYTES)
      return failure('INVALID_INPUT', 'Request body too large', 413)
    let body: unknown = {}
    const text = await request.text()
    if (text.trim()) {
      try {
        body = JSON.parse(text)
      }
      catch {
        return failure('INVALID_INPUT', 'The request body is not valid JSON')
      }
    }
    try {
      const ctx: OperationContext = {
        store,
        scanner,
        signal: request.signal,
        ...(options.scheduler ? { scheduler: options.scheduler } : {}),
        ...(options.notifier ? { notifier: options.notifier } : {}),
      }
      const data = await invoke(operations, ctx, request.params.operation, body)
      return Response.json({ ok: true, data }, { headers: NO_STORE })
    }
    catch (error) {
      return errorResponse(error)
    }
  }

  function handleReport(request: Request & { params: { scanId: string, device: string } }): Response {
    const denied = guard(request, false)
    if (denied)
      return denied
    const { scanId, device } = request.params
    const url = new URL(request.url).searchParams.get('url')
    if (!url || !(DEVICES as readonly string[]).includes(device))
      return failure('INVALID_INPUT', 'Use /report/<scanId>/<mobile|desktop>?url=<page url>')
    const report = store.getReport(scanId, url, device as Device)
    if (!report)
      return failure('NOT_FOUND', `No Lighthouse report for ${url} (${device}) in scan ${scanId}`)
    try {
      return new Response(renderReport(report), {
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'content-security-policy': 'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads',
          'referrer-policy': 'no-referrer',
          ...NO_STORE,
        },
      })
    }
    catch (error) {
      return errorResponse(new UnlighthouseError('NOT_FOUND', `The stored report cannot be read: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

  function handleCsv(request: Request & { params: { scanId: string, file: string } }): Response {
    const denied = guard(request, false)
    if (denied)
      return denied
    if (request.method !== 'GET' && request.method !== 'HEAD')
      return failure('INVALID_INPUT', 'Use GET', 405)
    const { scanId, file } = request.params
    if (!(CSV_FILES as readonly string[]).includes(file))
      return failure('NOT_FOUND', `Use /export/<scanId>/${CSV_FILES.join(' or ')}`)
    const bom = new URL(request.url).searchParams.get('bom')
    try {
      const csv = scanCsv(store, scanId, file as CsvFile, { bom: bom === '1' || bom === 'true' })
      return new Response(csv, {
        headers: {
          'content-type': 'text/csv; charset=utf-8; header=present',
          'content-disposition': `attachment; filename="unlighthouse-${scanId.replace(/[^\w-]/g, '')}-${file}"`,
          'x-content-type-options': 'nosniff',
          ...NO_STORE,
        },
      })
    }
    catch (error) {
      return errorResponse(error)
    }
  }

  function handleThumbnail(request: Request & { params: { scanId: string, device: string } }): Response {
    const denied = guard(request, false)
    if (denied)
      return denied
    const { scanId, device } = request.params
    const url = new URL(request.url).searchParams.get('url')
    if (!url || !(DEVICES as readonly string[]).includes(device))
      return failure('INVALID_INPUT', 'Use /thumb/<scanId>/<mobile|desktop>?url=<page url>')
    const thumbnail = store.getThumbnail(scanId, url, device as Device)
    if (!thumbnail)
      return failure('NOT_FOUND', `No thumbnail for ${url} (${device}) in scan ${scanId}`)
    const etag = `"${Bun.hash(thumbnail).toString(16)}"`
    const headers = {
      'content-type': 'image/webp',
      'cache-control': 'private, max-age=31536000, immutable',
      'etag': etag,
      'x-content-type-options': 'nosniff',
    }
    if (request.headers.get('if-none-match') === etag)
      return new Response(null, { status: 304, headers })
    return new Response(thumbnail as Uint8Array<ArrayBuffer>, { headers })
  }

  function handleFlowReport(request: Request & { params: { scanId: string, flow: string, device: string } }): Response {
    const denied = guard(request, false)
    if (denied)
      return denied
    const { scanId, flow: name, device } = request.params
    if (!(DEVICES as readonly string[]).includes(device))
      return failure('INVALID_INPUT', 'Use /flow-report/<scanId>/<flow name>/<mobile|desktop>')
    const report = store.getFlowReport(scanId, name, device as Device)
    if (!report)
      return failure('NOT_FOUND', `No flow report for ${name} (${device}) in scan ${scanId}`)
    try {
      return new Response(renderFlowReport(report), { headers: REPORT_HEADERS })
    }
    catch (error) {
      return errorResponse(new UnlighthouseError('NOT_FOUND', `The stored flow report cannot be read: ${error instanceof Error ? error.message : String(error)}`))
    }
  }

  const server = Bun.serve({
    hostname: host,
    port: options.port ?? 5678,
    development,
    maxRequestBodySize: MAX_BODY_BYTES,
    routes: {
      '/__unlighthouse/dashboard.html': dashboard,
      '/api/:operation': request => handleApi(request),
      '/report/:scanId/:device': request => handleReport(request),
      '/export/:scanId/:file': request => handleCsv(request),
      '/thumb/:scanId/:device': request => handleThumbnail(request),
      '/flow-report/:scanId/:flow/:device': request => handleFlowReport(request),
      '/ws': (request, srv) => {
        const denied = guard(request, true)
        if (denied)
          return denied
        if (srv.upgrade(request, { data: { topics: new Set() } }))
          return undefined
        return failure('INVALID_INPUT', 'Expected a WebSocket upgrade', 426)
      },
      '/*': (request, srv) => handleDashboard(request, srv),
    },
    websocket: {
      data: {} as SocketData,
      idleTimeout: 120,
      maxPayloadLength: 64 * 1024,
      message(ws, raw) {
        let message: unknown
        try {
          message = JSON.parse(String(raw))
        }
        catch {
          return
        }
        if (typeof message !== 'object' || message === null)
          return
        const { subscribe, unsubscribe } = message as { subscribe?: unknown, unsubscribe?: unknown }
        if (typeof subscribe === 'string' && subscribe && ws.data.topics.size < MAX_TOPICS) {
          ws.data.topics.add(subscribe)
          ws.subscribe(topic(subscribe))
        }
        if (typeof unsubscribe === 'string') {
          ws.data.topics.delete(unsubscribe)
          ws.unsubscribe(topic(unsubscribe))
        }
      },
    },
  })
  cookieName = `unlighthouse_token_${server.port}`

  const off = bus.on((event) => {
    if ('scanId' in event && event.scanId)
      server.publish(topic(event.scanId), JSON.stringify(event))
  })

  const displayHost = boundName && isLoopbackHost(boundName) ? (boundName === '::1' ? '[::1]' : boundName) : '127.0.0.1'
  const url = `http://${displayHost}:${server.port}`
  return {
    url,
    loginUrl: `${url}/?token=${encodeURIComponent(token)}`,
    token,
    port: server.port!,
    host,
    exposed: !(boundName && isLoopbackHost(boundName)),
    async stop() {
      off()
      await server.stop(true)
    },
  }
}
