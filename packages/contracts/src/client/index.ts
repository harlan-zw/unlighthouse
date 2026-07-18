// Typed UI client over the HTTP projection. Browser + Node compatible.
// Method/path come from the SAME `commandToRoute` the server uses (in
// `@unlighthouse/contracts/commands`), so the client can't drift from the
// projection and honours `http.*` overrides / `query.` prefix / PUT / DELETE.
//
// Lives in contracts (not core) because it is derived entirely from the command
// registry — its only imports are `../commands` and `../errors`. The UI's live
// path imports this and nothing from core; the static path lives in core
// (`core/api/static-client`) because it needs the real handlers + memory storage.

import type {
  Command,
  CommandInput,
  CommandName,
  CommandOutput,
  CommandRegistry,
  NonStreamingCommandName,
} from '../commands'
import { commandEntries, commandToRoute } from '../commands'
import { ErrorCodes, errorFromEnvelope, isErrorEnvelope, UnlighthouseError } from '../errors'

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

/**
 * Invoke a non-streaming client method while preserving registry key/input/output
 * correlation through generic callers (query and mutation adapters in particular).
 */
export function callClientCommand<K extends NonStreamingCommandName>(
  client: UnlighthouseClient,
  command: K,
  input: CommandInput<CommandRegistry[K]>,
): Promise<CommandOutput<CommandRegistry[K]>> {
  // TypeScript widens an indexed mapped-function access to the union of every
  // client method. `NonStreamingCommandName` proves this branch is unary; keep
  // the unavoidable key/method correlation bridge at the contract owner.
  const method = client[command] as (
    input: CommandInput<CommandRegistry[K]>,
  ) => Promise<CommandOutput<CommandRegistry[K]>>
  return method(input)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toSearchParams(input: unknown): string {
  if (!isRecord(input))
    return ''
  const params = new URLSearchParams()
  function flatten(obj: Record<string, unknown>, prefix = '') {
    for (const [k, v] of Object.entries(obj)) {
      if (v == null)
        continue
      const key = prefix ? `${prefix}.${k}` : k
      const t = typeof v
      if (t === 'string' || t === 'number' || t === 'boolean') {
        params.set(key, String(v))
      }
      else if (isRecord(v)) {
        flatten(v, key)
      }
    }
  }
  flatten(input)
  const s = params.toString()
  return s ? `?${s}` : ''
}

async function parseErrorAndThrow(res: Response): Promise<never> {
  let code = `HTTP_${res.status}`
  let message = res.statusText || `Request failed with status ${res.status}`
  let typedError: UnlighthouseError | null = null
  const text = await res.text()
  if (text) {
    try {
      const body = JSON.parse(text)
      if (isErrorEnvelope(body)) {
        typedError = errorFromEnvelope(body)
        code = typedError.code || code
        message = typedError.message || message
      }
    }
    catch (_err) {
      // Non-JSON error bodies fall back to the HTTP status text.
    }
  }
  const err = typedError ?? new UnlighthouseError({
    code,
    message,
    statusCode: res.status,
    retryable: res.status >= 500 || res.status === 429,
  })
  // Back-compat with the previous client, which threw plain Error objects with
  // `name` set to the machine code.
  err.name = code
  throw err
}

function parseCommandOutput<C extends Command>(
  cmd: C,
  value: unknown,
): CommandOutput<C> {
  const parsed = cmd.output.safeParse(value)
  if (!parsed.success) {
    throw new UnlighthouseError({
      code: ErrorCodes.INTERNAL,
      message: `${cmd.name}: response did not match its output contract.`,
      cause: parsed.error,
    })
  }
  return parsed.data as CommandOutput<C>
}

export function createClient(opts: CreateClientOptions = {}): UnlighthouseClient {
  const baseUrl = opts.baseUrl ?? '/api'
  const fetchImpl = opts.fetch ?? globalThis.fetch
  const baseHeaders = opts.headers ?? {}

  const client = {} as Record<string, unknown>

  for (const [name, cmd] of commandEntries()) {
    const { method, path } = commandToRoute(cmd)
    const url = (qs: string) => `${baseUrl}${path}${qs}`

    if ('streaming' in cmd && cmd.streaming) {
      // NDJSON streaming over GET. Returns AsyncIterable<Output>.
      client[name] = (input: unknown) => {
        async function* iterate(): AsyncGenerator<unknown> {
          const res = await fetchImpl(url(toSearchParams(input)), {
            method: 'GET',
            headers: { ...baseHeaders, Accept: 'application/x-ndjson' },
          })
          if (!res.ok)
            await parseErrorAndThrow(res)
          if (!res.body) {
            throw new UnlighthouseError({
              code: ErrorCodes.INTERNAL,
              message: `${cmd.name}: streaming response had no body.`,
            })
          }
          const reader = res.body.getReader()
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
                yield parseCommandOutput(cmd, JSON.parse(line))
              nl = buffer.indexOf('\n')
            }
          }
          const tail = buffer.trim()
          if (tail)
            yield parseCommandOutput(cmd, JSON.parse(tail))
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
      return parseCommandOutput(cmd, text ? JSON.parse(text) : undefined)
    }
  }

  return client as UnlighthouseClient
}
