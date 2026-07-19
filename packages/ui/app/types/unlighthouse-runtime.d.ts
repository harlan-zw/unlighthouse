import type { ClientRuntimePayload } from '@unlighthouse/contracts'

declare global {
  interface Window {
    __unlighthouse_static?: boolean
    __unlighthouse_payload?: ClientRuntimePayload
  }
}

export {}
