import { ModuleContainer } from '@nuxt/kit'
import { joinURL, withTrailingSlash } from 'ufo'
import { CreateMiddlewareOptions, RouteDefinition } from './types'

export default function(this: ModuleContainer) {
  let appRoutes: any[]
  this.extendRoutes((routes: any[]) => {
    appRoutes = routes
  })
  const getRoutes = () => new Promise<RouteDefinition[]>((resolve) => {
    if (appRoutes) {
      resolve(appRoutes)
      return
    }
    this.extendRoutes((routes: any[]) => {
      resolve(routes)
    })
  })
  const addStartCliBadgeMessage = (message: string) => {
    this.nuxt.options.cli.badgeMessages.push(message)
  }
  const addStartCliBadgeLink = (link: string, label: string) => {
    // need to wait for listen hook so we know what URL we've started at
    this.nuxt.hook('listen', () => {
      const url = withTrailingSlash(joinURL(this.nuxt.server.listeners && this.nuxt.server.listeners[0] ? this.nuxt.server.listeners[0].url : '/', link))
      addStartCliBadgeMessage(`${label}: ${url}`)
    })
  }

  const addMiddleware = (options: CreateMiddlewareOptions) => {
    this.nuxt.hook('build:templates', ({ templateVars }) => {
      templateVars.middleware.push({
        name: options.name,
        dst: `./${options.dst}`,
      })
      templateVars.router.middleware.push(options.name)
    })

    this.addTemplate({
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
