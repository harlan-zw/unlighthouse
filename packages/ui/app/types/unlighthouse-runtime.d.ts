import type { ClientOptionsPayload, StaticScreenshotMap } from '@unlighthouse/contracts'
import type { StaticSnapshot } from '@unlighthouse/core/api/static-client'

declare global {
  interface Window {
    __unlighthouse_static?: boolean
    __unlighthouse_payload?: {
      options?: ClientOptionsPayload
      snapshot?: StaticSnapshot
      screenshots?: StaticScreenshotMap
    }
  }
}

export {}
