import type { ConsolaInstance } from 'consola'
import { createConsola } from 'consola'
import { createContext } from 'unctx'
import { AppName } from './constants'

const loggerCtx = createContext<ConsolaInstance>()

export function createLogger(debug = false) {
  const logger = createConsola().withTag(AppName)

  if (debug) {
    // debug
    logger.level = 4
  }
  loggerCtx.set(logger)
  return logger
}

/**
 * Gets the instantiated logger instance using the shared context, persists the application logging configuration.
 */
export const useLogger: () => ConsolaInstance = () => {
  let logger = loggerCtx.use()
  // just in-case the logger wasn't initialised, we want to always return an instance to avoid null checks in DX
  if (!logger)
    logger = createLogger()

  return logger
}
