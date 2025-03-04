export * from './dist/index.js'

declare global {
  import type { UserConfig } from '@unlighthouse/core'

  const defineUnlighthouseConfig: UserConfig | (() => UserConfig) | (() => Promise<UserConfig>)
}
