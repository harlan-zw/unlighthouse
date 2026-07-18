import type { ScanStatus } from '@unlighthouse/contracts'
import type { HookEvent, HookMap, HookName, HookPayload } from '@unlighthouse/contracts/hooks'
import type { Hookable } from 'hookable'

export type WsEnvelope = HookEvent

export type ScanEventPayloads = {
  [K in HookName]: HookPayload<K>
} & {
  '*': WsEnvelope
}

export type ScanEventHookMap = HookMap & {
  '*': (event: WsEnvelope) => void | Promise<void>
}

export type ScanEventName = keyof ScanEventPayloads

export interface ScanEventBus {
  on: Hookable<ScanEventHookMap>['hook']
  off: Hookable<ScanEventHookMap>['removeHook']
  /**
   * Subscribe to socket *re*connects (not the initial connect). Lets a
   * consumer recover events missed while the socket was down — e.g. drive
   * `useNuxtSubscription`'s `ctx.resync()`. Returns an unsubscribe fn.
   */
  onReconnect: (fn: () => void) => () => void
  dispose: () => void
}

export type UiScanStatus = ScanStatus | 'idle'
