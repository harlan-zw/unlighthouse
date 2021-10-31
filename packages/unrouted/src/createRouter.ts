import type { IncomingMessage, ServerResponse } from 'http'
import defu from 'defu'
import { createContext } from 'unctx'
import type { Handle } from 'h3'
import { useBody as useBodyH3, MIMES, promisifyHandle, send } from 'h3'
import { parse } from 'regexparam'
import { createHooks } from 'hookable'
import {
  HttpMethod,
  UnroutedOptions,
  UnroutedResolvedOptions,
  UnroutedRouteDefinition,
  UnroutedRouter,
} from './types'
import { execRoute } from './util'
import * as plugins from './plugins'

const getParamContext = createContext()
const getBodyContext = createContext()

export const useParams: <T>() => T = getParamContext.use
export const useBody: <T>() => T = getBodyContext.use

export function createRouter(options = {} as UnroutedOptions): UnroutedRouter {
  const resolvedOptions = defu(options, {
    prefix: '/',
  }) as UnroutedResolvedOptions

  // contains references to the stack
  const methodStack: Record<HttpMethod, UnroutedRouteDefinition[]> = {
    '*': [],
    'GET': [],
    'POST': [],
    'PUT': [],
    'PATCH': [],
    'DELETE': [],
    'HEAD': [],
    'OPTIONS': [],
  }

  const router: Partial<UnroutedRouter> = {
    options: resolvedOptions,
    prefix: resolvedOptions.prefix,
    hooks: createHooks(),
  }

  // add hooks
  if (options.hooks)
    router.hooks?.addHooks(options.hooks)

  router.use = (method, urlPattern, handle, options?) => {
    if (handle.length > 2)
      handle = promisifyHandle(handle)
    const routeDefinition: UnroutedRouteDefinition = {
      urlPattern: parse(urlPattern),
      handle: handle as Handle,
      options,
    }
    if (!Array.isArray(method))
      method = [method]

    // @ts-ignore
    method.forEach((m) => {
      methodStack[m].push(routeDefinition)
    })
    return router as UnroutedRouter
  }

  // eslint-disable-next-line no-restricted-syntax
  for (const plugin in plugins)
    // @ts-ignore
    plugins[plugin](router as UnroutedRouter)

  const handle = async(req: IncomingMessage, res: ServerResponse) => {
    // @ts-ignore express/connect compatibility
    req.originalUrl = req.originalUrl || req.url || '/'
    // match explicit methods first
    const stack = methodStack[req.method as HttpMethod]
    // @ts-ignore
    const requestPath = new URL(req.url || '/', `${req.protocol || 'http'}://${req.headers.host}`).pathname

    const routesToRun: UnroutedRouteDefinition[] = stack
      .filter(r => r.urlPattern.pattern.test(requestPath))

    // eslint-disable-next-line no-restricted-syntax
    for (const routeKey in routesToRun) {
      const h = routesToRun[routeKey]
      if (!h || res.writableEnded)
        return false

      getParamContext.set(execRoute(requestPath, h.urlPattern), true)
      getBodyContext.set(await useBodyH3(req), true)

      // good to execute
      const val = await h.handle(req, res)

      if (res.writableEnded)
        return true

      const type = typeof val
      if (type === 'string') {
        return send(res, val, MIMES.html)
      }
      else if (type === 'object' && val !== undefined) {
        // Return 'false' and 'null' values as JSON strings
        if (val && val.buffer)
          return send(res, val)
        else
          return send(res, JSON.stringify(val, null, 2), MIMES.json)
      }
    }
  }

  router.handle = async(...args) => {
    // @ts-ignore
    const [req, res, next] = args
    await promisifyHandle(handle)(req, res)
    if (next) { // @ts-ignore
      next()
    }
  }

  return router as UnroutedRouter
}
