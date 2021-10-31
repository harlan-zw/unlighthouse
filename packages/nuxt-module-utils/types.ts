export interface RouteDefinition {
  name: string
  path: string
  params?: Record<string, any>
  component?: string
  chunkName?: string
  _name?: string
}

export interface CreateMiddlewareOptions {
  src: string
  dst: string
  name: string
  options: Record<string, any>
}

export type WatchEvent = 'add' | 'addDir' | 'change' | 'unlink' | 'unlinkDir'
