// Single source of truth for how a command projects onto HTTP (method + path).
// Both the server router (`core/src/api/http.ts`) and the browser client
// (`core/src/api/client.ts`) derive routes from THIS function, so the two can
// no longer drift — and the client now honours `http.method` / `http.path`
// overrides, the `query.` GET prefix, and PUT/DELETE, which its old hand-kept
// `GET_COMMANDS` list could not express.

import type { Command } from './define'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE'

// Commands that read state — projected as GET even without an explicit hint.
const GET_PREFIXES = ['query.']
const GET_EXACT = new Set<string>([
  'history.list',
  'scan.status',
  'scan.results',
  'scan.summary',
  'scan.categories',
  'scan.meta',
  'scan.current',
  'route.get',
  'route.audits',
  'compare.findPrevious',
  'pack.list',
  'manifest',
  'health',
  'ready',
  'auditors.list',
  'sites.list',
])

function defaultMethod(cmd: Command): HttpMethod {
  if (cmd.streaming)
    return 'GET'
  if (GET_PREFIXES.some(p => cmd.name.startsWith(p)))
    return 'GET'
  if (GET_EXACT.has(cmd.name))
    return 'GET'
  return 'POST'
}

function defaultPath(cmd: Command): string {
  return `/${cmd.name.split('.').join('/')}`
}

/** Resolve the HTTP method + path for a single command. */
export function commandToRoute(cmd: Command): { method: HttpMethod, path: string } {
  return {
    method: (cmd.http?.method as HttpMethod | undefined) ?? defaultMethod(cmd),
    path: cmd.http?.path ?? defaultPath(cmd),
  }
}
