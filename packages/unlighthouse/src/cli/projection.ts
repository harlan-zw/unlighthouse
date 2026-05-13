// CLI projection: turns the @unlighthouse/contracts command registry into a
// citty CommandDef tree. Mirrors the HTTP / MCP projections.

import type {
  Command,
  CommandInput,
  CommandName,
  CommandOutput,
  CommandRegistry,
} from '@unlighthouse/contracts'
import type { CommandDef } from 'citty'
import type { z } from 'zod'
import { commands } from '@unlighthouse/contracts'

export interface ProjectCliOptions {
  /** Invoke a command — usually the typed HTTP client. */
  invoke: <K extends CommandName>(
    name: K,
    input: CommandInput<CommandRegistry[K]>,
  ) =>
    | Promise<CommandOutput<CommandRegistry[K]>>
    | AsyncIterable<CommandOutput<CommandRegistry[K]>>
}

interface FieldInfo {
  name: string
  /** citty arg type. `json` is a custom marker we map to `string` and parse. */
  type: 'string' | 'number' | 'boolean' | 'array' | 'json'
  optional: boolean
  description?: string
  enumValues?: string[]
  defaultValue?: unknown
}

/**
 * Extract top-level field metadata from a `z.object({...})` schema.
 * Covers primitives, arrays, enums, defaults, optional, and nested-object
 * fallthrough to JSON strings. Sufficient for the 22 registered commands.
 */
function extractFields(schema: z.ZodType): FieldInfo[] {
  const shape = (schema as unknown as { shape?: Record<string, z.ZodType> }).shape
  if (!shape)
    return []
  const out: FieldInfo[] = []
  for (const [name, raw] of Object.entries(shape)) {
    let node: z.ZodType = raw
    let optional = false
    let defaultValue: unknown
    // Peel optional / default wrappers.
    while (true) {
      const t = (node as unknown as { _def: { type: string, innerType?: z.ZodType, defaultValue?: unknown } })._def.type
      if (t === 'optional') {
        optional = true
        node = (node as unknown as { _def: { innerType: z.ZodType } })._def.innerType
        continue
      }
      if (t === 'default') {
        defaultValue = (node as unknown as { _def: { defaultValue: unknown } })._def.defaultValue
        node = (node as unknown as { _def: { innerType: z.ZodType } })._def.innerType
        continue
      }
      if (t === 'nullable') {
        node = (node as unknown as { _def: { innerType: z.ZodType } })._def.innerType
        continue
      }
      break
    }
    const def = (node as unknown as { _def: { type: string, entries?: Record<string, string> } })._def
    const description = (raw as unknown as { description?: string }).description
      ?? (node as unknown as { description?: string }).description
    const info: FieldInfo = { name, type: 'string', optional, description, defaultValue }
    switch (def.type) {
      case 'string':
        info.type = 'string'
        break
      case 'number':
      case 'int':
      case 'bigint':
        info.type = 'number'
        break
      case 'boolean':
        info.type = 'boolean'
        break
      case 'array':
        info.type = 'array'
        break
      case 'enum':
        info.type = 'string'
        info.enumValues = Object.values(def.entries ?? {})
        break
      case 'object':
      case 'record':
      case 'union':
      case 'discriminatedUnion':
      case 'intersection':
      case 'tuple':
      case 'any':
      case 'unknown':
        info.type = 'json'
        break
      default:
        info.type = 'string'
    }
    out.push(info)
  }
  return out
}

/** Coerce raw citty arg values into the command input shape. */
function shapeInput(fields: FieldInfo[], args: Record<string, unknown>): Record<string, unknown> {
  const input: Record<string, unknown> = {}
  for (const f of fields) {
    const v = args[f.name]
    if (v === undefined || v === '' || v === null) {
      if (f.defaultValue !== undefined)
        input[f.name] = typeof f.defaultValue === 'function' ? (f.defaultValue as () => unknown)() : f.defaultValue
      continue
    }
    if (f.type === 'json' && typeof v === 'string') {
      try {
        input[f.name] = JSON.parse(v)
      }
      catch {
        input[f.name] = v
      }
      continue
    }
    if (f.type === 'array' && typeof v === 'string') {
      input[f.name] = [v]
      continue
    }
    input[f.name] = v
  }
  return input
}

function buildArgs(fields: FieldInfo[]): NonNullable<CommandDef['args']> {
  const args: Record<string, unknown> = {}
  for (const f of fields) {
    const arg: Record<string, unknown> = {
      type: f.type === 'json' ? 'string' : f.type,
      required: !f.optional && f.defaultValue === undefined,
    }
    if (f.description)
      arg.description = f.description
    if (f.enumValues)
      arg.valueHint = f.enumValues.join('|')
    if (f.defaultValue !== undefined && typeof f.defaultValue !== 'function')
      arg.default = f.defaultValue
    if (f.type === 'json')
      arg.description = `${arg.description ?? ''} (JSON string)`.trim()
    args[f.name] = arg
  }
  return args as NonNullable<CommandDef['args']>
}

function isAsyncIterable<T>(v: unknown): v is AsyncIterable<T> {
  return !!v && typeof (v as { [Symbol.asyncIterator]?: unknown })[Symbol.asyncIterator] === 'function'
}

function buildSubCommand<K extends CommandName>(
  name: K,
  cmd: Command<string, z.ZodType, z.ZodType> & { exitCodes?: Record<string, number> },
  invoke: ProjectCliOptions['invoke'],
): CommandDef {
  const fields = extractFields(cmd.input)
  return {
    meta: { name, description: cmd.description },
    args: buildArgs(fields),
    run: async ({ args }) => {
      const input = shapeInput(fields, args as Record<string, unknown>)
      try {
        const result = await Promise.resolve(invoke(name, input as never))
        if (isAsyncIterable(result)) {
          for await (const chunk of result)
            process.stdout.write(`${JSON.stringify(chunk)}\n`)
        }
        else {
          process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
        }
      }
      catch (err) {
        const e = err as { name?: string, message?: string }
        const code = e?.name && e.name !== 'Error' ? e.name : 'UNKNOWN'
        process.stderr.write(`${JSON.stringify({ error: { code, message: e?.message ?? String(err) } })}\n`)
        const exit = cmd.exitCodes?.[code] ?? 1
        process.exit(exit)
      }
    },
  }
}

/** Project the command registry as a citty CommandDef with subCommands. */
export function projectCommands(opts: ProjectCliOptions): CommandDef {
  const subCommands: Record<string, CommandDef> = {}
  for (const name of Object.keys(commands) as CommandName[]) {
    const cmd = commands[name] as Command<string, z.ZodType, z.ZodType> & {
      cli?: { hidden?: boolean }
      exitCodes?: Record<string, number>
    }
    if (cmd.cli?.hidden)
      continue
    subCommands[name] = buildSubCommand(name, cmd, opts.invoke)
  }

  // Host-only subcommand: boot the stdio MCP server. Not part of the registry
  // because it's a process-lifecycle action, not a transport-agnostic command.
  subCommands.mcp = {
    meta: { name: 'mcp', description: 'Start the Unlighthouse MCP server over stdio.' },
    async run() {
      const { runMcp } = await import('./mcp')
      await runMcp()
    },
  }

  return {
    meta: { name: 'unlighthouse', description: 'Unlighthouse CLI (projected from command registry).' },
    subCommands,
  }
}
