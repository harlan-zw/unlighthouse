import type { UserConfig } from '@unlighthouse/core'
import type { ConfigLayerMeta, DefineConfig } from 'c12'

export type { UserConfig }

export interface DefineUnlighthouseConfig extends DefineConfig<UserConfig, ConfigLayerMeta> {}
export declare const defineUnlighthouseConfig: DefineUnlighthouseConfig
