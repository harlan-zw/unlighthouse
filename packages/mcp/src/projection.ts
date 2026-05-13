// MCP projection of the command registry.
// Mirrors @unlighthouse/core/api/http.ts but emits MCP tools.

import type { Command, CommandName } from '@unlighthouse/contracts'
import type { Handler, HandlerCtx, HandlerMap } from '@unlighthouse/core/api/handlers'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { commands, UnlighthouseError } from '@unlighthouse/contracts'
import { z } from 'zod'

/**
 * Per-request ctx factory. Symmetric with the HTTP router: hosts use this to
 * mint a request-scoped `HandlerCtx` from MCP `extra` (transport-bound state,
 * auth, etc.). Throw `UnlighthouseError` to short-circuit with a typed code.
 */
export type McpHandlerCtxFactory = (req: { name: string, arguments: unknown }, extra: unknown) => HandlerCtx | Promise<HandlerCtx>

export interface CreateMcpServerOptions {
  handlers: HandlerMap
  /** Static ctx (single-tenant) or a factory invoked per tool call (multi-tenant). */
  ctx: HandlerCtx | McpHandlerCtxFactory
  /** Server identity for MCP handshake. Defaults to { name: 'unlighthouse', version: '1.0.0' }. */
  identity?: { name?: string, version?: string }
}

// Map UnlighthouseError.code → MCP error code.
function mcpErrorCodeForCode(code: string): number {
  if (code === 'NOT_SUPPORTED')
    return ErrorCode.MethodNotFound
  if (code === 'INPUT_INVALID' || code === 'CONFIG_INVALID')
    return ErrorCode.InvalidParams
  return ErrorCode.InternalError
}

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  return value != null && typeof (value as AsyncIterable<unknown>)[Symbol.asyncIterator] === 'function'
}

function toolNameFor(cmd: Command): string {
  return cmd.mcp?.name ?? cmd.name.replaceAll('.', '_')
}

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  // Strip $schema — MCP clients don't need it and some reject extra keys.
  if ('$schema' in json)
    delete json.$schema
  return json
}

export function createMcpServer(opts: CreateMcpServerOptions): Server {
  const { handlers, ctx: ctxOpt, identity } = opts
  const ctxFactory: McpHandlerCtxFactory
    = typeof ctxOpt === 'function' ? ctxOpt : () => ctxOpt

  const server = new Server(
    {
      name: identity?.name ?? 'unlighthouse',
      version: identity?.version ?? '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    },
  )

  // Build tool list + reverse map (tool name → command name) once.
  const toolToCommand = new Map<string, CommandName>()
  const tools: Array<{ name: string, description: string, inputSchema: Record<string, unknown> }> = []

  for (const name of Object.keys(commands) as CommandName[]) {
    const cmd = commands[name] as Command
    if (cmd.mcp?.hidden)
      continue
    const toolName = toolNameFor(cmd)
    toolToCommand.set(toolName, name)
    tools.push({
      name: toolName,
      description: cmd.description,
      inputSchema: toJsonSchema(cmd.input),
    })
  }

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools }
  })

  server.setRequestHandler(CallToolRequestSchema, async (req, extra) => {
    const toolName = req.params.name
    const commandName = toolToCommand.get(toolName)
    if (!commandName)
      throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${toolName}`)

    const cmd = commands[commandName] as Command
    const handler = handlers[commandName]
    if (!handler)
      throw new McpError(ErrorCode.MethodNotFound, `No handler for ${commandName}`)

    const parsed = cmd.input.safeParse(req.params.arguments ?? {})
    if (!parsed.success) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Input validation failed: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      )
    }

    let ctx: HandlerCtx
    try {
      ctx = await ctxFactory({ name: req.params.name, arguments: req.params.arguments }, extra)
    }
    catch (err) {
      if (err instanceof UnlighthouseError)
        throw new McpError(mcpErrorCodeForCode(err.code), err.message)
      throw new McpError(ErrorCode.InternalError, err instanceof Error ? err.message : String(err))
    }

    try {
      const result = (handler as Handler<typeof cmd>).run(parsed.data, ctx)
      const awaited = await result

      // Streaming: if client opted-in via _meta.progressToken, emit each chunk
      // as a notifications/progress message (payload is passed in the
      // passthrough params). Otherwise fall back to collecting into an array.
      if (isAsyncIterable(awaited)) {
        const progressToken = req.params._meta?.progressToken
        if (progressToken !== undefined) {
          let progress = 0
          for await (const chunk of awaited) {
            progress += 1
            await extra.sendNotification({
              method: 'notifications/progress',
              params: {
                progressToken,
                progress,
                payload: chunk,
              },
            })
          }
          return {
            content: [{ type: 'text', text: 'stream-complete' }],
          }
        }
        const out: unknown[] = []
        for await (const chunk of awaited)
          out.push(chunk)
        return {
          content: [{ type: 'text', text: JSON.stringify(out) }],
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(awaited) }],
      }
    }
    catch (err) {
      if (err instanceof UnlighthouseError) {
        throw new McpError(
          mcpErrorCodeForCode(err.code),
          `[${err.code}] ${err.message}`,
        )
      }
      throw new McpError(
        ErrorCode.InternalError,
        err instanceof Error ? err.message : String(err),
      )
    }
  })

  return server
}
