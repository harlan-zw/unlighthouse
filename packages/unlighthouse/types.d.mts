import type { UserConfig } from '@unlighthouse/core'

export * from './dist/index.mjs'

declare global {
  const defineUnlighthouseConfig: UserConfig | (() => UserConfig) | (() => Promise<UserConfig>)
}
