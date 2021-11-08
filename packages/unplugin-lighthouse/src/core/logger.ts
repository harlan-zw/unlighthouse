import consola, { Consola } from 'consola'
import { NAME } from './constants'
import {createContext} from "unctx";

const loggerCtx = createContext<Consola>()
export const useLogger: () => Consola = () => {
    let logger = loggerCtx.use()
    // just in-case the logger wasn't initialised, we want to always return an instance to avoid null checks in DX
    if (!logger) {
        logger = consola.withScope(NAME)
    }
    return logger
}

export const createLogger = (debug: boolean = false) => {
    const logger = consola.withScope(NAME)

    if (debug) {
        // debug
        logger.level = 4
    }
    loggerCtx.set(logger)
    return logger
}
