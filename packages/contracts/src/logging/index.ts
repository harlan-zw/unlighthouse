import type { Logger } from '../ports/core'
import type { OperationalLogName } from './catalog'
import { OPERATIONAL_LOG_CATALOG } from './catalog'

export { OPERATIONAL_LOG_CATALOG }
export type { OperationalLogName }

export interface ParsedOperationalError {
  name?: string
  message: string
  stack?: string
  code?: string
}

export interface OperationalLogEntry {
  level: 'warn' | 'error'
  name: OperationalLogName
  description: string
  error: ParsedOperationalError | null
  ctx: Record<string, unknown> | null
}

export function parseOperationalError(error: unknown): ParsedOperationalError | null {
  if (error == null)
    return null
  if (error instanceof Error) {
    const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code,
    }
  }
  if (typeof error === 'object') {
    const name = 'name' in error ? error.name : undefined
    const message = 'message' in error ? error.message : undefined
    const stack = 'stack' in error ? error.stack : undefined
    const code = 'code' in error ? error.code : undefined
    return {
      name: typeof name === 'string' ? name : undefined,
      message: typeof message === 'string' ? message : String(error),
      stack: typeof stack === 'string' ? stack : undefined,
      code: typeof code === 'string' ? code : undefined,
    }
  }
  return { message: String(error) }
}

function writeLogger(
  level: 'warn' | 'error',
  logger: Pick<Logger, 'warn' | 'error'> | undefined,
  entry: OperationalLogEntry,
): void {
  const target = logger?.[level]
  if (!target)
    return
  target.call(logger, `[${entry.name}] ${entry.description}`, {
    error: entry.error,
    ctx: entry.ctx,
  })
}

function emit(
  level: 'warn' | 'error',
  name: OperationalLogName,
  error: unknown,
  ctx?: Record<string, unknown>,
  logger?: Pick<Logger, 'warn' | 'error'>,
): OperationalLogEntry {
  const entry: OperationalLogEntry = {
    level,
    name,
    description: OPERATIONAL_LOG_CATALOG[name],
    error: parseOperationalError(error),
    ctx: ctx ?? null,
  }
  writeLogger(level, logger, entry)
  return entry
}

export function logOperationalWarn(
  name: OperationalLogName,
  error: unknown,
  ctx?: Record<string, unknown>,
  logger?: Pick<Logger, 'warn' | 'error'>,
): OperationalLogEntry {
  return emit('warn', name, error, ctx, logger)
}

export function logOperationalError(
  name: OperationalLogName,
  error: unknown,
  ctx?: Record<string, unknown>,
  logger?: Pick<Logger, 'warn' | 'error'>,
): OperationalLogEntry {
  return emit('error', name, error, ctx, logger)
}
