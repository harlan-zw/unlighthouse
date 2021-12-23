import { ResolvedUserConfig, RuntimeSettings } from '@unlighthouse/core'

declare global {
  interface Window {
    /**
         * Lighthouse client runtime settings and resolved configurations.
         */
    __unlighthouse_options: ResolvedUserConfig & RuntimeSettings
  }
}
