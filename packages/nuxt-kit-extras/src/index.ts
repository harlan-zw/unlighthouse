import {useNuxt} from '@nuxt/kit-edge'
import { joinURL, withTrailingSlash } from 'ufo'
import {  RouteDefinition } from './types'

export const getRoutes = () => new Promise<RouteDefinition[]>((resolve) => {
  const nuxt = useNuxt()
  if (nuxt.options.router.routes.length)
    resolve(nuxt.options.router.routes)

  nuxt.hook('build:extendRoutes', (routes: any[]) => {
    resolve(routes)
  })
})
export const addStartCliBadgeMessage = (message: string) => {
  const nuxt = useNuxt()
  // pad with empty line
  nuxt.options.cli.badgeMessages.push('')
  nuxt.options.cli.badgeMessages.push(message)
}
export const addStartCliBadgeLink = (link: string, label: string) => {
  const nuxt = useNuxt()
  // need to wait for listen hook so we know what URL we've started at
  nuxt.hook('listen', () => {
    const url = withTrailingSlash(joinURL(nuxt.server.listeners && nuxt.server.listeners[0] ? nuxt.server.listeners[0].url : '/', link))
    addStartCliBadgeMessage(`${label}: ${url}`)
  })
}

export const waitForServer = () => {
  const nuxt = useNuxt()
  return new Promise<any>((resolve) => {
    // need to wait for listen hook so we know what URL we've started at
    nuxt.hook('listen', () => {
      resolve(nuxt.server)
    })
  })
}

export const waitForFinishedBuild = () => {
  const nuxt = useNuxt()
  return new Promise<void>((resolve) => {
    nuxt.hook('build:done', () => {
      resolve()
    })
  })
}

export const waitForRoutes = () => {
  const nuxt = useNuxt()
  return new Promise<RouteDefinition[]>((resolve) => {
    nuxt.hook('build:extendRoutes', (routes: any[]) => {
      resolve(routes)
    })
  })
}
