import { z } from 'zod'
import type { Store } from '../contracts.ts'
import { UnlighthouseError, toErrorPayload } from '../errors.ts'
import { operations as defaultOperations } from '../ops/operations.ts'
import type { AnyOperation, OperationContext } from '../ops/registry.ts'
import { parseInput } from '../ops/registry.ts'
import type { Scanner } from '../scan/runner.ts'

export const MODERN_VERSIONS = ['2026-07-28']
export const LEGACY_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26']
export const SUPPORTED_VERSIONS = [...MODERN_VERSIONS, ...LEGACY_VERSIONS]

const META_VERSION = 'io.modelcontextprotocol/protocolVersion'
const META_SERVER_INFO = 'io.modelcontextprotocol/serverInfo'
const TOOLS_TTL_MS = 3_600_000
const DESTRUCTIVE = new Set(['scans.delete', 'schedules.delete', 'notifications.delete'])
const OPEN_WORLD = new Set(['scans.start', 'pages.rescan', 'schedules.runNow', 'notifications.test'])

const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602
const INTERNAL_ERROR = -32603
const UNSUPPORTED_VERSION = -32022

export const INSTRUCTIONS = `Unlighthouse audits whole websites with Lighthouse and keeps every scan in a local database.
Read results: sites_list (or scans_list) to find a scan id, then scans_summary first; drill down with issues_list -> issues_get, pages_list -> pages_get, scans_brokenLinks.
Run a scan: scans_start returns at once; call scans_wait with its id until status is done, failed or cancelled, then scans_summary.
Compare: compare { base, head } for two scans of one site; budgets_check for pass/fail limits.
Monitor: schedules_create runs a site on a cron timetable while unlighthouse serve runs; notifications_create sends Slack, Discord or webhook messages after scans (url as env:NAME); config_schema lists every scan option.
Scores are 0-1 (1 is best); metrics are milliseconds except CLS.`

type Id = string | number | null

interface JsonRpcRequest {
  jsonrpc: '2.0'
  id?: Id
  method: string
  params?: Record<string, unknown>
}

class RpcError extends Error {
  readonly code: number
  readonly data: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.code = code
    this.data = data
  }
}

export interface McpTool {
  name: string
  title: string
  description: string
  inputSchema: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  annotations: { readOnlyHint: boolean, destructiveHint: boolean, idempotentHint: boolean, openWorldHint: boolean }
}

export interface McpServerOptions {
  store: Store
  scanner: Scanner
  version: string
  operations?: AnyOperation[]
  notifier?: OperationContext['notifier']
  input?: ReadableStream<Uint8Array>
  write?: (line: string) => void
  log?: (message: string) => void
}

export function toolName(operation: string): string {
  return operation.replace(/\./g, '_')
}

function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): Record<string, unknown> {
  const { $schema: _, ...rest } = z.toJSONSchema(schema, { io, unrepresentable: 'any' }) as Record<string, unknown>
  return rest
}

export function describeTools(operations: readonly AnyOperation[]): McpTool[] {
  return operations.map((operation) => {
    const write = operation.kind === 'write'
    return {
      name: toolName(operation.name),
      title: operation.name,
      description: operation.description,
      inputSchema: jsonSchema(operation.input, 'input'),
      ...(operation.output ? { outputSchema: jsonSchema(operation.output, 'output') } : {}),
      annotations: {
        readOnlyHint: !write,
        destructiveHint: DESTRUCTIVE.has(operation.name),
        idempotentHint: !write || operation.name === 'scans.cancel' || DESTRUCTIVE.has(operation.name),
        openWorldHint: OPEN_WORLD.has(operation.name),
      },
    }
  })
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function createMcpHandler(options: Omit<McpServerOptions, 'input' | 'write'>) {
  const operations = options.operations ?? defaultOperations
  const tools = describeTools(operations)
  const byTool = new Map(operations.map(operation => [toolName(operation.name), operation]))
  const serverInfo = { name: 'unlighthouse', title: 'Unlighthouse', version: options.version }
  const capabilities = { tools: { listChanged: false } }
  const pending = new Map<string, AbortController>()
  const log = options.log ?? (() => {})

  async function callTool(params: Record<string, unknown>, signal: AbortSignal) {
    const name = params['name']
    if (typeof name !== 'string')
      throw new RpcError(INVALID_PARAMS, 'tools/call needs a tool name')
    const operation = byTool.get(name)
    if (!operation)
      throw new RpcError(INVALID_PARAMS, `Unknown tool: ${name}`)
    const args = params['arguments'] ?? {}
    if (!isRecord(args))
      throw new RpcError(INVALID_PARAMS, 'tools/call arguments must be an object')
    const started = performance.now()
    try {
      const input = parseInput(operation, args)
      const data = await operation.handler({ store: options.store, scanner: options.scanner, signal, ...(options.notifier ? { notifier: options.notifier } : {}) }, input)
      log(`${name} ok in ${Math.round(performance.now() - started)} ms`)
      return {
        content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
        structuredContent: Array.isArray(data) ? { items: data } : data,
        isError: false,
      }
    }
    catch (error) {
      const payload = toErrorPayload(error)
      log(`${name} failed: ${payload.code} ${payload.message}`)
      if (!(error instanceof UnlighthouseError))
        log(error instanceof Error && error.stack ? error.stack : String(error))
      return {
        content: [{ type: 'text', text: `${payload.code}: ${payload.message}` }],
        isError: true,
      }
    }
  }

  async function dispatch(request: JsonRpcRequest, modern: boolean, signal: AbortSignal): Promise<Record<string, unknown>> {
    const params = request.params ?? {}
    switch (request.method) {
      case 'initialize': {
        const requested = params['protocolVersion']
        const protocolVersion = typeof requested === 'string' && LEGACY_VERSIONS.includes(requested) ? requested : LEGACY_VERSIONS[0]!
        return { protocolVersion, capabilities, serverInfo, instructions: INSTRUCTIONS }
      }
      case 'server/discover':
        return { supportedVersions: SUPPORTED_VERSIONS, capabilities, instructions: INSTRUCTIONS, ttlMs: TOOLS_TTL_MS, cacheScope: 'public' }
      case 'ping':
        return {}
      case 'tools/list':
        return modern ? { tools, ttlMs: TOOLS_TTL_MS, cacheScope: 'public' } : { tools }
      case 'tools/call':
        return callTool(params, signal)
      default:
        throw new RpcError(METHOD_NOT_FOUND, `Method not found: ${request.method}`)
    }
  }

  function errorReply(id: Id, error: unknown) {
    if (error instanceof RpcError)
      return { jsonrpc: '2.0', id, error: { code: error.code, message: error.message, ...(error.data === undefined ? {} : { data: error.data }) } }
    log(error instanceof Error && error.stack ? error.stack : String(error))
    return { jsonrpc: '2.0', id, error: { code: INTERNAL_ERROR, message: error instanceof Error ? error.message : String(error) } }
  }

  async function handle(message: unknown): Promise<Record<string, unknown> | null> {
    if (Array.isArray(message))
      return errorReply(null, new RpcError(INVALID_REQUEST, 'JSON-RPC batches are not supported'))
    if (!isRecord(message) || message['jsonrpc'] !== '2.0')
      return errorReply(isRecord(message) && (typeof message['id'] === 'string' || typeof message['id'] === 'number') ? message['id'] : null, new RpcError(INVALID_REQUEST, 'Expected a JSON-RPC 2.0 message'))
    const hasId = 'id' in message
    const id = message['id']
    if (typeof message['method'] !== 'string')
      return hasId && !('result' in message || 'error' in message) ? errorReply(null, new RpcError(INVALID_REQUEST, 'Missing method')) : null
    if (message['params'] !== undefined && !isRecord(message['params']))
      return hasId ? errorReply(id as Id, new RpcError(INVALID_PARAMS, 'params must be an object')) : null
    const request = message as unknown as JsonRpcRequest

    if (!hasId) {
      if (request.method === 'notifications/cancelled') {
        const requestId = request.params?.['requestId']
        pending.get(JSON.stringify(requestId))?.abort()
      }
      return null
    }
    if (typeof id !== 'string' && typeof id !== 'number')
      return errorReply(null, new RpcError(INVALID_REQUEST, 'id must be a string or number'))

    const meta = request.params?.['_meta']
    const version = isRecord(meta) ? meta[META_VERSION] : undefined
    const modern = version !== undefined
    if (modern && (typeof version !== 'string' || !MODERN_VERSIONS.includes(version)))
      return errorReply(id, new RpcError(UNSUPPORTED_VERSION, 'Unsupported protocol version', { supported: SUPPORTED_VERSIONS, requested: version }))

    const key = JSON.stringify(id)
    const controller = new AbortController()
    pending.set(key, controller)
    try {
      const result = await dispatch(request, modern || request.method === 'server/discover', controller.signal)
      const decorated = modern || request.method === 'server/discover'
        ? { resultType: 'complete', ...result, _meta: { [META_SERVER_INFO]: serverInfo } }
        : result
      return { jsonrpc: '2.0', id, result: decorated }
    }
    catch (error) {
      return errorReply(id, error)
    }
    finally {
      pending.delete(key)
    }
  }

  function abortAll(): void {
    for (const controller of pending.values())
      controller.abort()
  }

  return { handle, abortAll, tools }
}

export async function serveMcp(options: McpServerOptions): Promise<void> {
  const write = options.write ?? ((line: string) => {
    process.stdout.write(line)
  })
  const handler = createMcpHandler(options)
  const input = options.input ?? Bun.stdin.stream()
  const inflight = new Set<Promise<void>>()
  const decoder = new TextDecoder()
  let buffer = ''

  const handleLine = (line: string) => {
    if (!line.trim())
      return
    let message: unknown
    try {
      message = JSON.parse(line)
    }
    catch {
      write(`${JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: PARSE_ERROR, message: 'Parse error' } })}\n`)
      return
    }
    const task = handler.handle(message).then((reply) => {
      if (reply)
        write(`${JSON.stringify(reply)}\n`)
    })
    inflight.add(task)
    task.finally(() => inflight.delete(task))
  }

  for await (const chunk of input) {
    buffer += decoder.decode(chunk, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      handleLine(buffer.slice(0, newline).replace(/\r$/, ''))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
  }
  handleLine(buffer + decoder.decode())
  handler.abortAll()
  await Promise.allSettled(inflight)
}
