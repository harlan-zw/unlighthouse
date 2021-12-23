import consola, { Consola } from 'consola'
import { createContext } from 'unctx'
import { AppName } from './constants'

const loggerCtx = createContext<Consola>()
/**
 * Gets the instantiated logger instance using the shared context, persists the application logging configuration.
 */
export const useLogger: () => Consola = () => {
  let logger = loggerCtx.use()
  // just in-case the logger wasn't initialised, we want to always return an instance to avoid null checks in DX
  if (!logger)
    logger = consola.withScope(AppName)

  return logger
}

export const createLogger = (debug = false) => {
  const logger = consola.withScope(AppName)

  if (debug) {
    // debug
    logger.level = 4
  }
  loggerCtx.set(logger)
  return logger
}
