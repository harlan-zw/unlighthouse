import type {
  Command,
  CommandInput,
  CommandName,
  CommandOutput,
  CommandRegistry,
} from '@unlighthouse/contracts/commands'
import type { Handler, HandlerCtx, HandlerMap } from './types'
import { ErrorCodes, UnlighthouseError } from '@unlighthouse/contracts/errors'

export type HandlerCtxSource = HandlerCtx | (() => HandlerCtx | Promise<HandlerCtx>)

export type CommandExecution<K extends CommandName>
  = | CommandOutput<CommandRegistry[K]>
    | AsyncIterable<CommandOutput<CommandRegistry[K]>>

export interface CreateCommandExecutorOptions {
  handlers: Readonly<HandlerMap>
}

export interface CommandExecutor {
  execute: <K extends CommandName>(
    name: K,
    rawInput: unknown,
    ctx: HandlerCtxSource,
  ) => Promise<CommandExecution<K>>
}

/** Validate raw transport input against the command bound to its handler. */
export function parseHandlerInput<C extends Command>(handler: Handler<C>, raw: unknown): CommandInput<C> {
  const parsed = handler.command.input.safeParse(raw)
  if (!parsed.success) {
    throw new UnlighthouseError({
      code: ErrorCodes.INPUT_INVALID,
      message: `${handler.command.name}: input validation failed`,
      details: { issues: parsed.error.issues },
    })
  }
  return parsed.data as CommandInput<C>
}

/**
 * Bind the canonical handler map behind one transport-neutral execution seam.
 *
 * Input is validated before a lazy request context is resolved. Streaming
 * results pass through untouched so each transport retains ownership of
 * iteration, cancellation, serialization, and error presentation.
 */
export function createCommandExecutor(opts: CreateCommandExecutorOptions): CommandExecutor {
  return {
    async execute<K extends CommandName>(name: K, rawInput: unknown, ctxSource: HandlerCtxSource): Promise<CommandExecution<K>> {
      const handler: Handler<CommandRegistry[K]> = opts.handlers[name]
      const input = parseHandlerInput(handler, rawInput)
      const ctx = typeof ctxSource === 'function' ? await ctxSource() : ctxSource
      return handler.run(input, ctx)
    },
  }
}
