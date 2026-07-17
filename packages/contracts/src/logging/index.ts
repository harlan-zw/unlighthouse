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
    const coded = error as Error & { code?: unknown }
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: typeof coded.code === 'string' ? coded.code : undefined,
    }
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>
    return {
      name: typeof record.name === 'string' ? record.name : undefined,
      message: typeof record.message === 'string' ? record.message : String(error),
      stack: typeof record.stack === 'string' ? record.stack : undefined,
      code: typeof record.code === 'string' ? record.code : undefined,
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
