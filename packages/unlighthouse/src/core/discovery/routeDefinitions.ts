import { join, dirname } from 'path'
// @ts-ignore
import { createRoutes } from '@nuxt/utils'
import { RouteDefinition } from 'unlighthouse-utils'
import { useUnlighthouse } from '../unlighthouse'
import { useLogger } from '../logger'

/**
 * Using the configuration discovery details will try and resolve the route definitions using the file system.
 */
export const discoverRouteDefinitions = async() => {
  const { resolvedConfig } = useUnlighthouse()
  if (!resolvedConfig.discovery)
    return []

  const logger = useLogger()

  const { supportedExtensions, pagesDir } = resolvedConfig.discovery


  // handle pages being in the root
  const root = pagesDir === '' ? dirname(resolvedConfig.root) : resolvedConfig.root
  const pages = pagesDir === '' ? resolvedConfig.root.replace(`${root}/`, '') : pagesDir

  const resolveFiles = async(dir: string) => {
    const { globby } = (await import('globby'))

    // can't wrap single extension in {} within regex
    const extensions = supportedExtensions.length > 1 ? `{${supportedExtensions.join(',')}}` : supportedExtensions[0]
    return await globby(join(dir, '**', `*.${extensions}`), {
      cwd: root,
    })
  }

  const files: Record<string, string> = {}
  const ext = new RegExp(`\\.(${supportedExtensions.join('|')})$`)
  for (const page of await resolveFiles(pages)) {
    const key = page.replace(ext, '')
    // .vue file takes precedence over other extensions
    if (/\.vue$/.test(page) || !files[key])
      files[key] = page.replace(/(['"])/g, '\\$1')
  }

  logger.debug(`Found ${Object.values(files).length} page files to map to route definitions.`)

  return createRoutes({
    files: Object.values(files),
    srcDir: root,
    pagesDir: pages,
    routeNameSplitter: '-',
    supportedExtensions,
    trailingSlash: undefined,
  }).map((route: RouteDefinition) => {
    //
    const pathNodes = route.path.split('/')
    route.path = pathNodes
      .map((n) => {
        // some fixes for next.js routing
        if (n.startsWith('[') && n.endsWith(']')) {
          const strippedNode = n.replace('[', '').replace(']', '').replace('...', '')
          return `:${strippedNode}`
        }
        return n
      })
      .join('/')
    return route
  })
}
