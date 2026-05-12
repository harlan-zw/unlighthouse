import type { UserConfig } from 'unlighthouse'

export * from './dist/index.mjs'

declare global {
  const defineUnlighthouseConfig: UserConfig | (() => UserConfig) | (() => Promise<UserConfig>)
}
