import type { RouteDefinition } from '../types'
import { join } from 'node:path'
import { useLogger } from '../logger'
import { useUnlighthouse } from '../unlighthouse'
import { createRoutes } from '../util/createRoutes'

/**
 * Using the configuration discovery details will try and resolve the route definitions using the file system.
 */
export async function discoverRouteDefinitions() {
  const { resolvedConfig } = useUnlighthouse()
  if (!resolvedConfig.discovery)
    return []

  const logger = useLogger()

  const { supportedExtensions, pagesDir } = resolvedConfig.discovery

  // handle pages being in the root
  const dir = pagesDir === '' ? resolvedConfig.root.replace(`${resolvedConfig.root}/`, '') : pagesDir

  const resolveFiles = async (dir: string) => {
    const { glob } = await import('tinyglobby')

    // can't wrap single extension in {} within regex
    const extensions = supportedExtensions.length > 1 ? `{${supportedExtensions.join(',')}}` : supportedExtensions[0]

    return await glob([
      join(dir, '**', `*.${extensions}`),
      '!**/README.md',
      '!**/node_modules',
    ], {
      cwd: resolvedConfig.root,
      // avoid some edge-cases
      deep: 5,
    })
  }

  const files: Record<string, string> = {}
  const ext = new RegExp(`\\.(${supportedExtensions.join('|')})$`)
  const resolvedPages = await resolveFiles(dir)

  for (const page of resolvedPages) {
    const key = page.replace(ext, '')
    // .vue file takes precedence over other extensions
    if (/\.vue$/.test(page) || !files[key])
      files[key] = page.replace(/(['"])/g, '\\$1')
  }

  logger.debug(`Discovered \`${resolvedPages.length}\` page files from  \`${join(resolvedConfig.root, dir)}\`. Mapping to route definitions.`)
  if (resolvedPages.length)
    logger.debug(resolvedPages)

  return createRoutes({
    files: Object.values(files),
    srcDir: resolvedConfig.root,
    pagesDir: dir,
    routeNameSplitter: '-',
    supportedExtensions,
    trailingSlash: false,
  }).map((route: RouteDefinition) => {
    //
    const pathNodes = route.path.split('/')
    route.path = pathNodes
      .map((n) => {
        // some fixes for next.js routing
        if (n.startsWith('[') && n.endsWith(']')) {
          const strippedNode = n
            .replace('[', '')
            .replace(']', '')
            .replace('...', '')
          return `:${strippedNode}`
        }
        return n
      })
      .join('/')
    return route
  })
}
