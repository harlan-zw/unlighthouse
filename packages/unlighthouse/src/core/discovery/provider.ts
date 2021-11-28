import { join } from 'path'
import { Provider, ResolvedUserConfig } from '@shared'
import fs from 'fs-extra'
import { useLogger } from '../logger'

export const discoverProvider: (config: ResolvedUserConfig) => Provider|void = (config) => {
  const logger = useLogger()
  // check for nuxt v2
  const nuxtRouteDefinitionPath = join(config.root, '.nuxt', 'routes.json')
  if (fs.existsSync(nuxtRouteDefinitionPath)) {
    logger.info('Discovered provider Nuxt.js, using \`.nuxt/routes.json\` for route definitions.')
    return {
      routeDefinitions() {
        return fs.readJsonSync(nuxtRouteDefinitionPath)
      },
    }
  }
}
