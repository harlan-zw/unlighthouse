import type { Logger } from '@unlighthouse/contracts'
import { createConsola } from 'consola'

export interface CreateLoggerOptions {
  level?: number
}

export function createLogger(opts: CreateLoggerOptions = {}): Logger {
  return createConsola({ level: opts.level ?? 3 }).withTag('unlighthouse') as Logger
}
