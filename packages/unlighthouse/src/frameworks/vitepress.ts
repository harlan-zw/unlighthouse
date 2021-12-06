import { UserConfig } from 'unlighthouse-utils'
import Unlighthouse from '../vite'

/**
 * Creates Unlighthouse with discovery mapping for the default VitePress behaviour.
 *
 * @param config
 * @constructor
 */
export default function UnlighthouseVitePress(config: UserConfig) {
  return Unlighthouse({
    ...config,
    discovery: {
      pagesDir: '',
      supportedExtensions: ['md'],
    },
  })
}
