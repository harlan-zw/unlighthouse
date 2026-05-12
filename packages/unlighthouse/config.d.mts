import type { ConfigLayerMeta, DefineConfig } from 'c12'
import type { UserConfig } from 'unlighthouse'

export { UserConfig } from 'nuxt/schema'

export interface DefineUnlighthouseConfig extends DefineConfig<UserConfig, ConfigLayerMeta> {}
export declare const defineUnlighthouseConfig: DefineUnlighthouseConfig
