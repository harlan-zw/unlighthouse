// HTTP projection: derives an h3 Router from the command registry + handler set.
// Each command → one route. Streaming commands → NDJSON GETs.

import type { Command, CommandName } from '@unlighthouse/contracts/commands'
import type { H3Event, Router } from 'h3'
import type { Handler, HandlerCtx, HandlerMap } from './handlers/types'
import { commands } from '@unlighthouse/contracts/commands'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { createRouter, defineEventHandler, getQuery, getRouterParams, readBody, setResponseHeader, setResponseStatus } from 'h3'
import { createTaggedLogger } from '../logger'

const log = createTaggedLogger('api')

/**
 * Per-request ctx factory. Hosts use this to construct a request-scoped
 * `HandlerCtx` from the incoming h3 event — typically reading an auth header,
 * resolving a tenant, and handing the handler a tenant-scoped Storage. Throw an
 * `UnlighthouseError` to short-circuit with a typed error status; the router
 * maps it via the same status table used for handler errors.
 */
export type HandlerCtxFactory = (event: H3Event) => HandlerCtx | Promise<HandlerCtx>

export interface CreateHttpRouterOptions {
  handlers: HandlerMap
  /** Static ctx (single-tenant) or a factory invoked per request (multi-tenant). */
  ctx: HandlerCtx | HandlerCtxFactory
  /** Optional path prefix (default '/api'). */
  prefix?: string
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

// Commands that read state — projected as GET even without an explicit hint.
const GET_PREFIXES = ['query.']
const GET_EXACT = new Set<string>([
  'history.list',
  'scan.status',
  'scan.results',
  'scan.summary',
  'scan.categories',
  'scan.meta',
  'scan.current',
  'route.get',
  'route.audits',
  'compare.findPrevious',
  'pack.list',
  'manifest',
  'health',
  'auditors.list',
  'sites.list',
])

function defaultMethod(cmd: Command): HttpMethod {
  if (cmd.streaming)
    return 'GET'
  if (GET_PREFIXES.some(p => cmd.name.startsWith(p)))
    return 'GET'
  if (GET_EXACT.has(cmd.name))
    return 'GET'
  return 'POST'
}

function defaultPath(cmd: Command): string {
  return `/${cmd.name.split('.').join('/')}`
}

/** Resolve the HTTP method + path for a single command. Exported for parity tests. */
export function commandToRoute(cmd: Command): { method: HttpMethod, path: string } {
  return {
    method: (cmd.http?.method as HttpMethod | undefined) ?? defaultMethod(cmd),
    path: cmd.http?.path ?? defaultPath(cmd),
  }
}

// Map UnlighthouseError.code → HTTP status.
function statusForCode(code: string): number {
  if (code === 'SCAN_NOT_FOUND' || code === 'ROUTE_NOT_FOUND')
    return 404
  if (code === 'ACTIVE_SCAN_CONFLICT')
    return 409
  if (code === 'NOT_SUPPORTED')
    return 501
  if (code === 'CONFIG_INVALID' || code === 'INPUT_INVALID')
    return 400
  return 500
}

function unflatten(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.')
    let target = result
    for (let i = 0; i < parts.length - 1; i++) {
      if (!(parts[i] in target) || typeof target[parts[i]] !== 'object') {
        target[parts[i]] = {}
      }
      target = target[parts[i]] as Record<string, unknown>
    }
    target[parts[parts.length - 1]] = value
  }
  return result
}

async function readInput(event: H3Event, method: HttpMethod): Promise<unknown> {
  const params = getRouterParams(event) as Record<string, unknown>
  if (method === 'GET') {
    return unflatten(Object.assign({}, getQuery(event) as Record<string, unknown>, params))
  }
  // POST / PUT / DELETE → body, fall back to empty object.
  const body = await readBody(event).catch(() => undefined)
  if (isRecord(body))
    return Object.assign({}, body, params)
  return Object.assign({}, params)
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value != null && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
}

export function createHttpRouter(opts: CreateHttpRouterOptions): Router {
  const { handlers, ctx: ctxOpt } = opts
  const ctxFactory: HandlerCtxFactory
    = typeof ctxOpt === 'function' ? ctxOpt : () => ctxOpt
  const router = createRouter()

  for (const name of Object.keys(commands) as CommandName[]) {
    const cmd = commands[name] as Command
    const handler = handlers[name]
    if (!handler)
      continue
    const { method, path } = commandToRoute(cmd)

    const eventHandler = defineEventHandler(async (event) => {
      const raw = await readInput(event, method)
      log.debug(`${method} ${path} — input: ${JSON.stringify(raw)}`)

      const parsed = cmd.input.safeParse(raw)
      if (!parsed.success) {
        log.debug(`${method} ${path} — validation failed: ${parsed.error.issues.map(i => i.message).join(', ')}`)

        setResponseStatus(event, 400)
        return {
          error: {
            code: 'INPUT_INVALID',
            message: 'Input validation failed',
            issues: parsed.error.issues,
          },
        }
      }

      let ctx: HandlerCtx
      try {
        ctx = await ctxFactory(event)
      }
      catch (err) {
        if (err instanceof UnlighthouseError) {
          setResponseStatus(event, statusForCode(err.code))
          return { error: { code: err.code, message: err.message } }
        }
        setResponseStatus(event, 500)
        return {
          error: {
            code: 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : String(err),
          },
        }
      }

      try {
        const result = (handler as Handler<typeof cmd>).run(parsed.data, ctx)

        // Streaming commands → NDJSON.
        if (cmd.streaming) {
          const iterable = isAsyncIterable(result) ? result : await result
          setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
          const res = event.node.res
          try {
            if (isAsyncIterable(iterable)) {
              for await (const chunk of iterable)
                res.write(`${JSON.stringify(chunk)}\n`)
            }
            else {
              // Handler resolved a single value instead of an iterable — emit one line.
              res.write(`${JSON.stringify(iterable)}\n`)
            }
          }
          finally {
            res.end()
          }
          return
        }

        // Non-streaming: handler may still return an AsyncIterable; collect it.
        const awaited = await result
        if (isAsyncIterable(awaited)) {
          const out: unknown[] = []
          for await (const chunk of awaited)
            out.push(chunk)
          return out
        }
        return awaited
      }
      catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        const code = err instanceof UnlighthouseError ? err.code : 'INTERNAL_ERROR'
        log.debug(`${method} ${path} — error ${code}: ${errMsg}`)
        if (err instanceof UnlighthouseError) {
          setResponseStatus(event, statusForCode(err.code))
          return { error: { code: err.code, message: err.message } }
        }
        setResponseStatus(event, 500)
        return {
          error: {
            code: 'INTERNAL_ERROR',
            message: errMsg,
          },
        }
      }
    })

    const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'
    router[verb](path, eventHandler)
  }

  return router
}
