import type { CommandName, CommandRegistry } from '@unlighthouse/contracts'
import type { Handler, HandlerCtx, HandlerMap } from './types'

/**
 * Onion-model middleware around command dispatch.
 *
 * Each middleware receives the command name, the parsed input, the resolved ctx,
 * and a `next()` continuation. The middleware can:
 *   - mutate input/ctx before calling next
 *   - short-circuit by returning a value without calling next
 *   - wrap next() in try/catch to translate errors
 *   - tee into telemetry without touching the result
 *
 * Composition order: `wrapHandlers(map, [a, b, c])` runs as `a → b → c → handler`,
 * matching express/koa convention.
 *
 * Streaming handlers return AsyncIterable; middleware that need to inspect the
 * stream must consume + re-yield it themselves.
 */
export interface MiddlewareOp {
  command: CommandName
  input: unknown
  ctx: HandlerCtx
  next: (input?: unknown, ctx?: HandlerCtx) => Promise<unknown> | AsyncIterable<unknown>
}

export type HandlerMiddleware = (op: MiddlewareOp) => unknown | Promise<unknown> | AsyncIterable<unknown>

function compose(
  middlewares: HandlerMiddleware[],
  terminal: (input: unknown, ctx: HandlerCtx) => unknown | Promise<unknown> | AsyncIterable<unknown>,
  command: CommandName,
): (input: unknown, ctx: HandlerCtx) => unknown | Promise<unknown> | AsyncIterable<unknown> {
  return (input, ctx) => {
    let index = -1
    const dispatch = (i: number, currentInput: unknown, currentCtx: HandlerCtx): unknown | Promise<unknown> | AsyncIterable<unknown> => {
      if (i <= index)
        throw new Error('wrapHandlers: next() called multiple times')
      index = i
      if (i === middlewares.length)
        return terminal(currentInput, currentCtx)
      const mw = middlewares[i]
      return mw({
        command,
        input: currentInput,
        ctx: currentCtx,
        next: (nextInput, nextCtx) => dispatch(i + 1, nextInput ?? currentInput, nextCtx ?? currentCtx) as Promise<unknown> | AsyncIterable<unknown>,
      })
    }
    return dispatch(0, input, ctx)
  }
}

export function wrapHandlers(map: HandlerMap, middlewares: HandlerMiddleware[]): HandlerMap {
  if (!middlewares.length)
    return map
  const out = {} as HandlerMap
  for (const name of Object.keys(map) as CommandName[]) {
    const handler = map[name] as Handler
    const composed = compose(middlewares, (input, ctx) => handler.run(input as never, ctx), name)
    ;(out as Record<CommandName, Handler>)[name] = {
      command: handler.command,
      run: composed as Handler<CommandRegistry[typeof name]>['run'],
    } as Handler<CommandRegistry[typeof name]>
  }
  return out
}
