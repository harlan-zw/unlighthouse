import { IncomingMessage, ServerResponse } from 'http'
import type { AppOptions, Handle, Middleware } from 'h3'
import { Hookable } from 'hookable'
import { RouteMethod } from './plugins'

export type UnroutedPlugin = (router: UnroutedRouter) => void

export type Hook = `serve:before-route:/${string|''}`

export interface UnroutedOptions extends AppOptions {
  plugins?: UnroutedPlugin[]
  prefix?: string
  hooks?: Record<Hook, () => Promise<void>|void>
}

export interface UnroutedResolvedOptions {
  plugins: UnroutedPlugin[]
  prefix: string
}

export interface UnroutedRouter {
  options: UnroutedResolvedOptions
  use: (method: HttpMethodInput, urlPattern: string, handle: Handle | Middleware, options?: Record<string, any>) => UnroutedRouter
  // support runtime prefixing
  prefix: string
  handle: (req: IncomingMessage, res: ServerResponse) => Promise<unknown>

  hooks: Hookable

  /* plugins */
  // serve static files
  serve: (path: string, dirname: string) => UnroutedRouter
  // group routes
  group: (prefix: string, cb: (router: UnroutedRouter) => void) => void
  // verbs
  match: (methods: HttpMethodInput, route: string, action: Function | string | object) => void
  any: RouteMethod
  get: RouteMethod
  post: RouteMethod
  put: RouteMethod
  patch: RouteMethod
  del: RouteMethod
  // redirects
  redirect: (route: string, location: string, code?: 301|302|307|410|451) => void
  permanentRedirect: (route: string, location: string) => void
}

export type HttpMethod = 'GET' | 'HEAD' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | '*'
export type HttpMethodInput = HttpMethod | HttpMethod[]

export interface UnroutedRoute {
  keys: string[]
  pattern: RegExp
}

export interface UnroutedRouteDefinition {
  urlPattern: UnroutedRoute
  handle: Handle
  match?: (req: IncomingMessage) => boolean
  options?: Record<string, any>
}
