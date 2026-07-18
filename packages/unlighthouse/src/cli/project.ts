// D-033: project the command registry onto a citty subcommand tree — the third
// transport alongside HTTP (core/api/http.ts) and MCP (mcp/projection.ts). Dot
// names map to nested subcommands (`scan.start` -> `unlighthouse scan start`);
// flags derive from each command's Zod input via `cittyFlagsFor`. A parity test
// (packages/unlighthouse/test/cli-parity.test.ts) asserts every non-hidden command projects with the
// flags this module derives, so the CLI can't drift from the registry.

import type { Command, CommandName } from '@unlighthouse/contracts/commands'
import type { CommandExecutor, HandlerCtx, HandlerMap } from '@unlighthouse/core/api/handlers'
import type { ArgsDef, CommandDef } from 'citty'
import { commandEntries, isAsyncIterable } from '@unlighthouse/contracts/commands'
import { createCommandExecutor } from '@unlighthouse/core/api/handlers'
import { z } from 'zod'

const WRAPPER_TYPES = new Set(['optional', 'nullable', 'default', 'nullish', 'readonly', 'catch'])
const OPTIONAL_WRAPPERS = new Set(['optional', 'nullish', 'default', 'catch'])

interface ZodInternal { def?: { type?: string, innerType?: ZodInternal }, description?: string }

/** Unwrap optional/default/nullable wrappers to the base type; report requiredness. */
function unwrap(schema: ZodInternal): { base: ZodInternal, required: boolean } {
  let s = schema
  let required = true
  while (s?.def && s.def.type && WRAPPER_TYPES.has(s.def.type)) {
    if (OPTIONAL_WRAPPERS.has(s.def.type))
      required = false
    if (!s.def.innerType)
      break
    s = s.def.innerType
  }
  return { base: s, required }
}

function descriptionOf(schema: ZodInternal): string | undefined {
  return schema?.description ?? unwrap(schema).base?.description
}

/**
 * Derive citty flags from a command's Zod object input. Booleans project as
 * `--flag`; everything else (string / number / enum / array) is captured as a
 * string and coerced back on execution (`argsToInput`). Non-optional fields are
 * marked `required`. Keys stay verbatim (camelCase) so the mapping is lossless.
 */
export function cittyFlagsFor(input: z.ZodType): ArgsDef {
  const args: ArgsDef = {}
  if (!(input instanceof z.ZodObject))
    return args
  const shape = input.shape as Record<string, ZodInternal>
  for (const [key, field] of Object.entries(shape)) {
    const { base, required } = unwrap(field)
    const kind = base?.def?.type
    const description = descriptionOf(field)
    const arg: Record<string, unknown> = kind === 'boolean' ? { type: 'boolean' } : { type: 'string' }
    if (description)
      arg.description = description
    if (required)
      arg.required = true
    args[key] = arg as ArgsDef[string]
  }
  return args
}

/** Rebuild a command input object from parsed citty args, coercing per Zod type. */
export function argsToInput(input: z.ZodType, args: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  if (!(input instanceof z.ZodObject))
    return out
  const shape = input.shape as Record<string, ZodInternal>
  for (const [key, field] of Object.entries(shape)) {
    let value = args[key]
    if (value === undefined)
      continue
    const kind = unwrap(field).base?.def?.type
    if (kind === 'number' && typeof value === 'string')
      value = value.trim() === '' ? value : Number(value)
    else if (kind === 'array' && typeof value === 'string')
      value = value.split(',').map(s => s.trim()).filter(Boolean)
    out[key] = value
  }
  return out
}

export interface CliProjectionOptions {
  handlers: HandlerMap
  /** Lazily build the per-invocation handler context (storage/core/config). */
  createCtx: () => HandlerCtx | Promise<HandlerCtx>
  /** Render a command's result to stdout (human or agent NDJSON). */
  emit: (cmd: Command, result: unknown) => void | Promise<void>
  /**
   * Terminal error handler — emits the typed error and maps `cmd.exitCodes` to a
   * process exit code. Should not return (call `process.exit`). When omitted the
   * error rethrows to citty's default handler.
   */
  onError?: (cmd: Command, err: unknown) => never | Promise<never>
  /**
   * Called after a subcommand completes successfully. Projected subcommands are
   * one-shot; the host uses this to flush stdout and exit (the built ctx holds a
   * DB handle that would otherwise keep the process alive). Omitted in tests.
   */
  onComplete?: (cmd: Command) => void | Promise<void>
}

function leafCommand(name: CommandName, cmd: Command, flags: ArgsDef, opts: CliProjectionOptions, executor: CommandExecutor): CommandDef {
  const verb = cmd.name.split('.').pop() ?? cmd.name
  return {
    meta: { name: verb, description: cmd.description },
    args: flags,
    async run({ args }) {
      try {
        const raw = argsToInput(cmd.input, args as Record<string, unknown>)
        const result = await executor.execute(name, raw, opts.createCtx)
        if (isAsyncIterable(result)) {
          for await (const chunk of result)
            await opts.emit(cmd, chunk)
        }
        else {
          await opts.emit(cmd, result)
        }
        await opts.onComplete?.(cmd)
      }
      catch (err) {
        if (opts.onError)
          await opts.onError(cmd, err)
        throw err
      }
    },
  }
}

function insertNested(root: Record<string, CommandDef>, parts: string[], leaf: CommandDef, cmd: Command): void {
  if (parts.length === 1) {
    root[parts[0]!] = leaf
    return
  }
  const [head, ...rest] = parts
  const existing = root[head!] as (CommandDef & { subCommands?: Record<string, CommandDef> }) | undefined
  const parent = existing ?? {
    meta: { name: head!, description: `${head} commands` },
    subCommands: {} as Record<string, CommandDef>,
  }
  ;(parent as { subCommands: Record<string, CommandDef> }).subCommands ??= {}
  insertNested((parent as { subCommands: Record<string, CommandDef> }).subCommands, rest, leaf, cmd)
  root[head!] = parent
}

/**
 * Build the citty subcommand tree plus a flat name -> flags map for the parity
 * test. Respects `cmd.cli.hidden`.
 */
export function projectCliCommands(opts: CliProjectionOptions): {
  subCommands: Record<string, CommandDef>
  leafFlagsByName: Map<string, ArgsDef>
} {
  const subCommands: Record<string, CommandDef> = {}
  const leafFlagsByName = new Map<string, ArgsDef>()
  const executor = createCommandExecutor({ handlers: opts.handlers })
  for (const [name, cmd] of commandEntries()) {
    if (cmd.cli?.hidden)
      continue
    const flags = cittyFlagsFor(cmd.input)
    leafFlagsByName.set(name, flags)
    insertNested(subCommands, name.split('.'), leafCommand(name, cmd, flags, opts, executor), cmd)
  }
  return { subCommands, leafFlagsByName }
}
