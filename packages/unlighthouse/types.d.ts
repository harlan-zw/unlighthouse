import type { UserConfig } from '@unlighthouse/core'

export * from '@unlighthouse/core'

declare global {
  const defineUnlighthouseConfig: UserConfig | (() => UserConfig) | (() => Promise<UserConfig>)
}
