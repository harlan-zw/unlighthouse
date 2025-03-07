import type { DefineUnlighthouseConfig } from 'unlighthouse/config'

export * from './dist/index'

declare global {
  const defineUnlighthouseConfig: DefineUnlighthouseConfig
}
