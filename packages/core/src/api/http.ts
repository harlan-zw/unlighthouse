// HTTP projection: derives an h3 Router from the command registry + handler set.
// Each command → one route. Streaming commands → NDJSON GETs.

import type { Logger } from '@unlighthouse/contracts'
import type { Command, HttpMethod } from '@unlighthouse/contracts/commands'
import type { H3Event, Router } from 'h3'
import type { HandlerCtx, HandlerMap } from './handlers/types'
import { commandEntries, commandToRoute, isAsyncIterable } from '@unlighthouse/contracts/commands'
import { createErrorEnvelope, ErrorCodes, UnlighthouseError } from '@unlighthouse/contracts/errors'
import { logOperationalError, logOperationalWarn } from '@unlighthouse/contracts/logging'
import { createRouter, defineEventHandler, getQuery, getRouterParams, readBody, setResponseHeader, setResponseStatus } from 'h3'
import { createCommandExecutor } from './handlers/execute'

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
   * anywhere by default. Defaults to false; hosts opt in explicitly.
   */
  validateOutput?: boolean
  /** Include plain internal error messages in responses. Defaults to false. */
  exposeInternal?: boolean
  /** Host-owned logger; tagged to `api` for this router instance. */
  logger?: Logger
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function unflatten(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const parts = key.split('.')
    let target = result
    for (const part of parts.slice(0, -1)) {
      if (!isRecord(target[part])) {
        target[part] = {}
      }
      target = target[part] as Record<string, unknown>
    }
    const leaf = parts[parts.length - 1]
    if (leaf !== undefined)
      target[leaf] = value
  }
  return result
}

async function readInput(event: H3Event, method: HttpMethod, logger?: Logger): Promise<unknown> {
  const params = getRouterParams(event) as Record<string, unknown>
  if (method === 'GET') {
    return unflatten(Object.assign({}, getQuery(event) as Record<string, unknown>, params))
  }
  // POST / PUT / DELETE → body, fall back to empty object.
  const body = await readBody(event).catch((err) => {
    logOperationalWarn('api.request_body_parse_failed', err, { method }, logger)
    return undefined
  })
  if (isRecord(body))
    return Object.assign({}, body, params)
  return Object.assign({}, params)
}

// Contract-drift detector: the server validates command input but nothing
// validates output, so a handler that returns the wrong shape ships silently.
// This re-checks the result against `cmd.output` and warns on mismatch — it
// never throws or rewrites the response, so a stricter schema can't break a
// working client; it just surfaces the drift in the log.
function warnOnOutputMismatch(cmd: Command, value: unknown, logger?: Logger): void {
  const result = cmd.output.safeParse(value)
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 8)
      .map(i => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    logOperationalWarn('api.output_contract_mismatch', result.error, {
      command: cmd.name,
      issues,
    }, logger)
  }
}

function errorResponse(event: H3Event, err: unknown, opts: { exposeInternal?: boolean, details?: Record<string, unknown> } = {}) {
  const envelope = createErrorEnvelope(err, {
    exposeInternal: opts.exposeInternal ?? false,
    details: opts.details,
  })
  setResponseStatus(event, envelope.error.statusCode)
  return envelope
}

export function createHttpRouter(opts: CreateHttpRouterOptions): Router {
  const { handlers, ctx: ctxOpt } = opts
  const log = opts.logger?.withTag('api')
  const ctxFactory: HandlerCtxFactory
    = typeof ctxOpt === 'function' ? ctxOpt : () => ctxOpt
  const validateOutput = opts.validateOutput ?? false
  const exposeInternal = opts.exposeInternal ?? false
  const router = createRouter()
  const executor = createCommandExecutor({ handlers })

  for (const [name, cmd] of commandEntries()) {
    const handler = handlers[name]
    if (!handler)
      continue
    const { method, path } = commandToRoute(cmd)

    const eventHandler = defineEventHandler(async (event) => {
      const raw = await readInput(event, method, log)
      log?.debug(`${method} ${path} — input: ${JSON.stringify(raw)}`)

      let phase: 'input' | 'ctx' | 'handler' = 'input'
      try {
        const result = await executor.execute(name, raw, async () => {
          phase = 'ctx'
          const ctx = await ctxFactory(event)
          phase = 'handler'
          return ctx
        })

        // Streaming commands → NDJSON.
        if (cmd.streaming) {
          setResponseHeader(event, 'Content-Type', 'application/x-ndjson')
          const res = event.node.res
          const req = event.node.req
          if (isAsyncIterable(result)) {
            // Manual iteration so a client disconnect closes the iterator (its
            // `return()` unsubscribes and unblocks a pending next()) — a `for
            // await` alone would keep pulling live events and hold the slot open
            // for the whole scan after the client is gone.
            const iterator = result[Symbol.asyncIterator]()
            const onClose = () => { void iterator.return?.() }
            req.on('close', onClose)
            try {
              while (true) {
                const { value, done } = await iterator.next()
                if (done)
                  break
                res.write(`${JSON.stringify(value)}\n`)
              }
            }
            finally {
              req.off('close', onClose)
              await iterator.return?.()
              res.end()
            }
          }
          else {
            // Handler resolved a single value instead of an iterable — emit one line.
            try {
              res.write(`${JSON.stringify(result)}\n`)
            }
            finally {
              res.end()
            }
          }
          return
        }

        // Non-streaming: handler may still return an AsyncIterable; collect it.
        if (isAsyncIterable(result)) {
          const out: unknown[] = []
          for await (const chunk of result)
            out.push(chunk)
          return out
        }
        if (validateOutput)
          warnOnOutputMismatch(cmd, result, log)
        return result
      }
      catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err)
        const code = err instanceof UnlighthouseError ? err.code : ErrorCodes.INTERNAL
        log?.debug(`${method} ${path} — error ${code}: ${errMsg}`)
        if (phase === 'input')
          log?.debug(`${method} ${path} — input validation failed`)
        if (!(err instanceof UnlighthouseError))
          logOperationalError('api.unhandled_error', err, { method, path, phase }, log)
        return errorResponse(event, err, { exposeInternal })
      }
    })

    const verb = method.toLowerCase() as 'get' | 'post' | 'put' | 'delete'
    router[verb](path, eventHandler)
  }

  return router
}
