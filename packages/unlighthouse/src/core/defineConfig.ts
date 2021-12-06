import type { UserConfig } from 'unlighthouse-utils'

/**
 * A simple define wrapper to provide typings to config definitions.
 * @param config
 */
const defineConfig: (config: UserConfig) => UserConfig = (config) => {
  return config
}

export default defineConfig
