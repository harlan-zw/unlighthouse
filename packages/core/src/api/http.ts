// HTTP projection: derives an h3 Router from the command registry + handler set.
// Each command → one route. Streaming commands → NDJSON GETs.

import type { Command, CommandName, HttpMethod } from '@unlighthouse/contracts/commands'
import type { H3Event, Router } from 'h3'
import type { Handler, HandlerCtx, HandlerMap } from './handlers/types'
import { commands, commandToRoute } from '@unlighthouse/contracts/commands'
import { createErrorEnvelope, ErrorCodes, UnlighthouseError } from '@unlighthouse/contracts/errors'
import { logOperationalError, logOperationalWarn } from '@unlighthouse/contracts/logging'
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
  /**
   * Validate each handler's result against the command's `output` schema and
   * log a warning on mismatch (the response is still sent — this is a
   * contract-drift detector, not an enforcer, so a stricter schema can't break
   * a working client). Inputs are always validated; outputs are not enforced
   * anywhere by default. Defaults to on outside production.
   */
  validateOutput?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
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
  const body = await readBody(event).catch((err) => {
    logOperationalWarn('api.request_body_parse_failed', err, { method }, log)
    return undefined
  })
  if (isRecord(body))
    return Object.assign({}, body, params)
  return Object.assign({}, params)
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value != null && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
}

// Contract-drift detector: the server validates command input but nothing
// validates output, so a handler that returns the wrong shape ships silently.
// This re-checks the result against `cmd.output` and warns on mismatch — it
// never throws or rewrites the response, so a stricter schema can't break a
// working client; it just surfaces the drift in the log.
function warnOnOutputMismatch(cmd: Command, value: unknown): void {
  const result = cmd.output.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    logOperationalWarn('api.output_contract_mismatch', result.error, {
      command: cmd.name,
      issues,
    }, log)
  }
}

function errorResponse(event: H3Event, err: unknown, opts: { exposeInternal?: boolean, details?: Record<string, unknown> } = {}) {
  const envelope = createErrorEnvelope(err, {
    exposeInternal: opts.exposeInternal ?? process.env.NODE_ENV !== 'production',
    details: opts.details,
  })
  setResponseStatus(event, envelope.error.statusCode)
  return envelope
}

export function createHttpRouter(opts: CreateHttpRouterOptions): Router {
  const { handlers, ctx: ctxOpt } = opts
  const ctxFactory: HandlerCtxFactory
    = typeof ctxOpt === 'function' ? ctxOpt : () => ctxOpt
  const validateOutput = opts.validateOutput ?? (process.env.NODE_ENV !== 'production')
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
        return errorResponse(event, new UnlighthouseError({
          code: ErrorCodes.INPUT_INVALID,
          message: 'Input validation failed',
          details: { issues: parsed.error.issues },
        }))
      }

      let ctx: HandlerCtx
      try {
        ctx = await ctxFactory(event)
      }
      catch (err) {
        logOperationalError('api.unhandled_error', err, { method, path, phase: 'ctx' }, log)
        return errorResponse(event, err)
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
        if (validateOutput)
          warnOnOutputMismatch(cmd, awaited)
        return awaited
      }
      catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        const code = err instanceof UnlighthouseError ? err.code : ErrorCodes.INTERNAL
        log.debug(`${method} ${path} — error ${code}: ${errMsg}`)
        if (!(err instanceof UnlighthouseError))
          logOperationalError('api.unhandled_error', err, { method, path, phase: 'handler' }, log)
        return errorResponse(event, err)
      }
    })

    const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'
    router[verb](path, eventHandler)
  }

  return router
}
