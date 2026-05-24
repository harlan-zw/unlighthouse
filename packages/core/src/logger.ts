import { createConsola } from 'consola'

const isDebug = process.env.DEBUG === '1'
  || process.env.DEBUG === 'true'
  || process.env.DEBUG === '*'

export const logger = createConsola({
  level: isDebug ? 4 : 3,
}).withTag('unlighthouse')

export function createTaggedLogger(tag: string) {
  return logger.withTag(tag)
}
