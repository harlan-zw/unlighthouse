import type { ConsolaInstance } from 'consola'
import type { Logger } from '@unlighthouse/contracts'
import { createConsola } from 'consola'

function isDebugEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.DEBUG === '1' || env.DEBUG === 'true' || env.DEBUG === '*'
}

let rootLogger: ConsolaInstance | undefined

function getRootLogger(): ConsolaInstance {
  rootLogger ??= createConsola({
    level: isDebugEnv() ? 4 : 3,
  }).withTag('unlighthouse')
  return rootLogger
}

function lazyLogger(resolve: () => ConsolaInstance): ConsolaInstance {
  return new Proxy({} as ConsolaInstance, {
    get(_target, prop, receiver) {
      const target = resolve()
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? value.bind(target) : value
    },
    set(_target, prop, value, receiver) {
      return Reflect.set(resolve(), prop, value, receiver)
    },
    has(_target, prop) {
      return prop in resolve()
    },
    ownKeys() {
      return Reflect.ownKeys(resolve())
    },
    getOwnPropertyDescriptor(_target, prop) {
      return Reflect.getOwnPropertyDescriptor(resolve(), prop)
    },
  })
}

export const logger = lazyLogger(getRootLogger) as Logger

export function createTaggedLogger(tag: string): Logger {
  let tagged: ConsolaInstance | undefined
  return lazyLogger(() => {
    tagged ??= getRootLogger().withTag(tag)
    return tagged
  }) as Logger
}
