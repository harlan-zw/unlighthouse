// Command<I, O> type + defineCommand helper.
// See v1.md §"Command registry" (lines 706–937).

import type { z } from 'zod'

export interface CommandExample<I, O> {
  description?: string
  input: I
  output: O
}

export interface CommandHttpProjection {
  /** Override default `POST /api/<namespace>/<verb>` convention. */
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  /** Override default path. Defaults to `/api/<namespace>/<verb>`. */
  path?: string
}

export interface CommandMcpProjection {
  /** Override the MCP tool name. Defaults to dot→underscore of `name`. */
  name?: string
  /** Hide from the MCP tool registry. */
  hidden?: boolean
}

export interface CommandCliProjection {
  /** Hide from CLI help / citty registration. */
  hidden?: boolean
}

/**
 * The canonical Command shape. Inputs / outputs are Zod schemas; projections
 * to HTTP, MCP, and CLI are derived from the schemas + the per-transport hints.
 */
export interface Command<
  IName extends string = string,
  Input extends z.ZodType = z.ZodType,
  Output extends z.ZodType = z.ZodType,
> {
  /** Dot-namespaced name — `scan.start`, `query.routes`, etc. */
  name: IName
  /** One-line description used by `--help` AND the MCP tool description. */
  description: string
  input: Input
  output: Output
  /** Handler returns `AsyncIterable<Output>` instead of a single value. */
  streaming?: boolean
  examples?: CommandExample<z.infer<Input>, z.infer<Output>>[]
  /** CLI: structured-error code → process exit code. */
  exitCodes?: Record<string, number>
  http?: CommandHttpProjection
  mcp?: CommandMcpProjection
  cli?: CommandCliProjection
  /** SaaS auth middleware: required scopes/permissions for this command. */
  permissions?: string[]
}

/** Identity helper — preserves precise generic types for inference. */
export function defineCommand<
  IName extends string,
  Input extends z.ZodType,
  Output extends z.ZodType,
>(cmd: Command<IName, Input, Output>): Command<IName, Input, Output> {
  return cmd
}

/** Convenience type alias: a command's input type. */
export type CommandInput<C> = C extends Command<string, infer I, z.ZodType>
  ? z.infer<I>
  : never

/** Convenience type alias: a command's output type. */
export type CommandOutput<C> = C extends Command<string, z.ZodType, infer O>
  ? z.infer<O>
  : never
