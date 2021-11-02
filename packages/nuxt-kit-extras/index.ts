import { ModuleContainer, Nuxt } from '@nuxt/kit'
import { joinURL, withTrailingSlash } from 'ufo'
import { CreateMiddlewareOptions, RouteDefinition } from './types'

export default function(nuxt: Nuxt) {
  let appRoutes: any[]
  nuxt.hook('build:extendRoutes', (routes: any[]) => {
    appRoutes = routes
  })
  const getRoutes = () => new Promise<RouteDefinition[]>((resolve) => {
    if (appRoutes) {
      resolve(appRoutes)
      return
    }
    nuxt.extendRoutes((routes: any[]) => {
      resolve(routes)
    })
  })
  const addStartCliBadgeMessage = (message: string) => {
    nuxt.options.cli.badgeMessages.push(message)
  }
  const addStartCliBadgeLink = (link: string, label: string) => {
    // need to wait for listen hook so we know what URL we've started at
    nuxt.hook('listen', () => {
      const url = withTrailingSlash(joinURL(nuxt.server.listeners && nuxt.server.listeners[0] ? nuxt.server.listeners[0].url : '/', link))
      addStartCliBadgeMessage(`${label}: ${url}`)
    })
  }

  const addMiddleware = (options: CreateMiddlewareOptions) => {
    nuxt.hook('build:templates', ({ templateVars }) => {
      templateVars.middleware.push({
        name: options.name,
        dst: `./${options.dst}`,
      })
      templateVars.router.middleware.push(options.name)
    })

    addTemplate({
      src: options.src,
      fileName: options.dst,
      options: options.options,
    })
  }

  return {
    getRoutes,
    addMiddleware,
    addStartCliBadgeLink,
    addStartCliBadgeMessage,
  }
}
