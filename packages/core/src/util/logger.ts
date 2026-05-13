import type { ConsolaInstance } from 'consola'
import { createConsola } from 'consola'
import { createContext } from 'unctx'

const APP_NAME = 'Unlighthouse'

const loggerCtx = createContext<ConsolaInstance>()

export function createLogger(debug = false) {
  const logger = createConsola().withTag(APP_NAME)
  if (debug)
    logger.level = 4
  loggerCtx.set(logger, true)
  return logger
}

/**
 * Get the active consola instance from the unctx context. Falls back to a
 * lazily-created default so callers never need a null check.
 */
export const useLogger: () => ConsolaInstance = () => {
  let logger = loggerCtx.tryUse()
  if (!logger)
    logger = createLogger()
  return logger
}
