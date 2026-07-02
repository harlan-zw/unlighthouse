import type { UserConfig } from './types'
import { fetchUrlRaw, normaliseHost, ReportArtifacts } from './util'

export * from './build'
export * from './host'
export * from './types'
export { evaluateAndStoreAssertions } from '@unlighthouse/core/comparison'
export type { Assertion, AssertionResult } from '@unlighthouse/core/comparison'
export * from '@unlighthouse/core/crawlers'
export { fetchUrlRaw, normaliseHost, ReportArtifacts }

/**
 * Type-only helper for config files.
 * @deprecated Use `defineUnlighthouseConfig` from `unlighthouse/config` instead.
 */
export function defineConfig(config: UserConfig): UserConfig {
  return config
}
