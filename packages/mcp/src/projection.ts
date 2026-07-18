// MCP projection of the command registry.
// Mirrors @unlighthouse/core/api/http.ts but emits MCP tools.

import type { Command, CommandName } from '@unlighthouse/contracts/commands'
import type { HandlerCtx, HandlerMap } from '@unlighthouse/core/api/handlers'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js'
import { commandEntries, isAsyncIterable } from '@unlighthouse/contracts/commands'
import { createErrorEnvelope } from '@unlighthouse/contracts/errors'
import { createCommandExecutor } from '@unlighthouse/core/api/handlers'
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
  /** Include plain internal error messages. Defaults to false. */
  exposeInternal?: boolean
}

// Map UnlighthouseError.code → MCP error code.
function mcpErrorCodeForCode(code: string): number {
  if (code === 'NOT_SUPPORTED')
    return ErrorCode.MethodNotFound
  if (code === 'INPUT_INVALID' || code === 'CONFIG_INVALID')
    return ErrorCode.InvalidParams
  return ErrorCode.InternalError
}

function toMcpError(err: unknown, exposeInternal = false): McpError {
  const envelope = createErrorEnvelope(err, {
    exposeInternal,
  })
  const e = envelope.error
  return new McpError(
    mcpErrorCodeForCode(e.code),
    `[${e.code}] ${e.message}`,
    envelope,
  )
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
  const executor = createCommandExecutor({ handlers })

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

  for (const [name, cmd] of commandEntries()) {
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

    const handler = handlers[commandName]
    if (!handler)
      throw new McpError(ErrorCode.MethodNotFound, `No handler for ${commandName}`)

    try {
      const result = await executor.execute(
        commandName,
        req.params.arguments ?? {},
        () => ctxFactory({ name: req.params.name, arguments: req.params.arguments }, extra),
      )

      // Streaming: if client opted-in via _meta.progressToken, emit each chunk
      // as a notifications/progress message (payload is passed in the
      // passthrough params). Otherwise fall back to collecting into an array.
      if (isAsyncIterable(result)) {
        const progressToken = req.params._meta?.progressToken
        if (progressToken !== undefined) {
          let progress = 0
          for await (const chunk of result) {
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
        for await (const chunk of result)
          out.push(chunk)
        return {
          content: [{ type: 'text', text: JSON.stringify(out) }],
        }
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
      }
    }
    catch (err) {
      throw toMcpError(err, opts.exposeInternal)
    }
  })

  return server
}
