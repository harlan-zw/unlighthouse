import type { ConfigLayerMeta, DefineConfig } from 'c12'
import type { UserConfig } from 'unlighthouse'

export type { UserConfig } from 'unlighthouse'

export interface DefineUnlighthouseConfig extends DefineConfig<UserConfig, ConfigLayerMeta> {}
export declare const defineUnlighthouseConfig: DefineUnlighthouseConfig
