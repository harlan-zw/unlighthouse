// Typed UI client over the HTTP projection. Browser + Node compatible.
// Routes are derived by the same conventions as the HTTP projection;
// duplicated here intentionally to keep the client dependency-light.

import type {
  CommandInput,
  CommandName,
  CommandOutput,
  CommandRegistry,
} from '@unlighthouse/contracts'
import { commands } from '@unlighthouse/contracts'

export interface CreateClientOptions {
  /** Base URL of the HTTP projection (e.g. '/api', or 'https://host/api'). */
  baseUrl?: string
  /** Fetch override; defaults to globalThis.fetch. */
  fetch?: typeof fetch
  /** Headers merged into every request. */
  headers?: Record<string, string>
}

export type UnlighthouseClient = {
  [K in CommandName]: CommandRegistry[K] extends { streaming: true }
    ? (input: CommandInput<CommandRegistry[K]>) => AsyncIterable<CommandOutput<CommandRegistry[K]>>
    : (input: CommandInput<CommandRegistry[K]>) => Promise<CommandOutput<CommandRegistry[K]>>
}

/** Commands projected as GET (read-only / streaming reads). */
const GET_COMMANDS = new Set<CommandName>([
  'scan.status',
  'scan.results',
  'scan.meta',
  'scan.current',
  'route.get',
  'history.list',
  'history.get',
  'compare.findPrevious',
  'query.routes',
  'events.subscribe',
  'events.tail',
  'manifest',
  'health',
  'auditors.list',
])

/**
 * Derive `{ method, path }` from a command name. Path: `/<namespace>/<verb>`
 * for dotted names, `/<name>` for bare names.
 */
export function commandToRoute(cmdName: CommandName): { method: 'GET' | 'POST', path: string } {
  const method: 'GET' | 'POST' = GET_COMMANDS.has(cmdName) ? 'GET' : 'POST'
  const path = cmdName.includes('.')
    ? `/${cmdName.split('.').join('/')}`
    : `/${cmdName}`
  return { method, path }
}

/**
 * Encode a primitive input object as URLSearchParams. Nested objects/arrays
 * are skipped; complex inputs should use POST commands.
 */
function toSearchParams(input: unknown): string {
  if (!input || typeof input !== 'object')
    return ''
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (v == null)
      continue
    const t = typeof v
    if (t === 'string' || t === 'number' || t === 'boolean')
      params.set(k, String(v))
    // skip nested objects/arrays
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  let code = `HTTP_${res.status}`
  let message = res.statusText || `Request failed with status ${res.status}`
  await res.text().then((text) => {
    if (!text)
      return
    return Promise.resolve().then(() => JSON.parse(text)).then((body) => {
      if (body && typeof body === 'object' && body.error) {
        code = body.error.code || code
        message = body.error.message || message
      }
    }).catch(() => {})
  })
  const err = new Error(message)
  err.name = code
  throw err
}

export function createClient(opts: CreateClientOptions = {}): UnlighthouseClient {
  const baseUrl = opts.baseUrl ?? '/api'
  const fetchImpl = opts.fetch ?? globalThis.fetch
  const baseHeaders = opts.headers ?? {}

  const client = {} as Record<string, unknown>

  for (const name of Object.keys(commands) as CommandName[]) {
    const cmd = commands[name]
    const { method, path } = commandToRoute(name)
    const url = (qs: string) => `${baseUrl}${path}${qs}`

    if ((cmd as { streaming?: boolean }).streaming) {
      // NDJSON streaming over GET. Returns AsyncIterable<Output>.
      client[name] = (input: unknown) => {
        async function* iterate(): AsyncGenerator<unknown> {
          const res = await fetchImpl(url(toSearchParams(input)), {
            method: 'GET',
            headers: { ...baseHeaders, Accept: 'application/x-ndjson' },
          })
          if (!res.ok)
            await parseErrorAndThrow(res)
          const reader = res.body!.getReader()
          const decoder = new TextDecoder()
          let buffer = ''
          while (true) {
            const { value, done } = await reader.read()
            if (done)
              break
            buffer += decoder.decode(value, { stream: true })
            let nl = buffer.indexOf('\n')
            while (nl !== -1) {
              const line = buffer.slice(0, nl).trim()
              buffer = buffer.slice(nl + 1)
              if (line)
                yield JSON.parse(line)
              nl = buffer.indexOf('\n')
            }
          }
          const tail = buffer.trim()
          if (tail)
            yield JSON.parse(tail)
        }
        return iterate()
      }
      continue
    }

    client[name] = async (input: unknown) => {
      const isGet = method === 'GET'
      const res = await fetchImpl(
        url(isGet ? toSearchParams(input) : ''),
        isGet
          ? { method, headers: { ...baseHeaders, Accept: 'application/json' } }
          : {
              method,
              headers: {
                ...baseHeaders,
                'Accept': 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(input ?? {}),
            },
      )
      if (!res.ok)
        await parseErrorAndThrow(res)
      // Empty body → undefined; otherwise JSON.
      const text = await res.text()
      return text ? JSON.parse(text) : undefined
    }
  }

  return client as UnlighthouseClient
}
