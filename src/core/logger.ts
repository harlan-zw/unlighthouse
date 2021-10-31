import consola from 'consola'
import { NAME } from './constants'

const logger = consola.withScope(NAME)

// debug
logger.level = 4

export default logger
