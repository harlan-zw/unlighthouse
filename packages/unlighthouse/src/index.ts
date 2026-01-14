import { createHooks } from 'hookable'
import type { Hookable } from 'hookable'
import type { UnlighthouseHooks, UnlighthouseOptions } from './types'

export * from './types'
export * from './core/extract'
export * from './core/lci'
export * from './core/utils'
export * from './core/config'
export * from './core/constants'
export * from './core/queue'

export interface Unlighthouse {
  hooks: Hookable<UnlighthouseHooks>
}

export function createUnlighthouse(options: UnlighthouseOptions = {}): Unlighthouse {
  const hooks = createHooks<UnlighthouseHooks>()

  return {
    hooks,
  }
}
