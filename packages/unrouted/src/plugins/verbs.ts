import { Handle, LazyHandle } from 'h3'
import { withBase } from 'ufo'
import { HttpMethodInput, UnroutedRouter, UnroutedPlugin } from '../types'

export type RouteMethod = (route: string, handle: Handle<any>|LazyHandle|string|object) => UnroutedRouter

type VerbMethod = 'any' | 'get' | 'post' | 'put' | 'patch' | 'del'

const methods: Record<VerbMethod, HttpMethodInput> = {
  any: ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  get: ['GET', 'HEAD'],
  post: 'POST',
  put: 'PUT',
  patch: 'PATCH',
  del: 'DELETE',
  // 'HEAD',
  // 'OPTIONS',
}

export const verbs: UnroutedPlugin = (router) => {
  router.match = (methods: HttpMethodInput, route: string, handle: Handle|LazyHandle|string|object) => {
    // apply prefix, this could be from a group or something
    route = withBase(route, router.prefix)
    if (!route.startsWith('/'))
      route = `/${route}`

    router.use(methods, route, typeof handle === 'function' ? (handle as Handle) : () => handle)
  }

  Object.keys(methods).forEach((method) => {
    const key = method as VerbMethod
    router[key] = (route: string, handle: Function|string|object) => {
      router.match(methods[key], route, handle)
      return router
    }
  })
}
