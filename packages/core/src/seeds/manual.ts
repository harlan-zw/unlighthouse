import type { Logger } from '@unlighthouse/contracts'
import type { SeedSource } from '@unlighthouse/contracts/ports'

export interface ManualSeedsOptions {
  urls: string[] | (() => string[] | Promise<string[]>)
  /** Tagged logger from `createUnlighthouseCore`; absent = silent. */
  logger?: Logger
}

export function manualSeeds({ urls }: ManualSeedsOptions): SeedSource {
  return {
    async* seeds() {
      const list = typeof urls === 'function' ? await urls() : urls
      for (const url of list)
        yield { url, source: 'manual' }
    },
  }
}
