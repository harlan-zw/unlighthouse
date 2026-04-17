import type { UserConfig } from 'unlighthouse'
import type { ConfigLayerMeta, DefineConfig } from 'c12'

export { UserConfig } from 'nuxt/schema'

export interface DefineUnlighthouseConfig extends DefineConfig<UserConfig, ConfigLayerMeta> {}
export declare const defineUnlighthouseConfig: DefineUnlighthouseConfig
