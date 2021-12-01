import { join } from 'path'
import type { Provider, ResolvedUserConfig } from 'unlighthouse-utils'
import fs from 'fs-extra'
import { useLogger } from '../logger'
import {createMockRouter} from "../../router";

export const discoverProvider: (config: ResolvedUserConfig) => Provider|void = (config) => {
  const logger = useLogger()
  // check for nuxt v2
  const nuxtRouteDefinitionPath = join(config.root, '.nuxt', 'routes.json')
  if (fs.existsSync(nuxtRouteDefinitionPath)) {
    logger.info('Discovered provider Nuxt.js, using \`.nuxt/routes.json\` for route definitions.')
    const routeDefinitions = fs.readJsonSync(nuxtRouteDefinitionPath)
    return {
      name: 'nuxt',
      mockRouter: createMockRouter(routeDefinitions),
      routeDefinitions,
    }
  }
}
