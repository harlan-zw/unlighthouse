import { Container, ContainerProxy, getContainer } from '@cloudflare/containers'

export { ContainerProxy }

const PORT = 5678
const SYNC_HOST = 'unlighthouse.sync'
const COOKIE = `unlighthouse_token_${PORT}`
const STATE_KEY = 'state.json'
const BUSY_STATUSES = ['queued', 'discovering', 'auditing']

async function digest(value: string): Promise<ArrayBuffer> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
}

async function sameSecret(given: string | null | undefined, secret: string): Promise<boolean> {
  if (!given || !secret)
    return false
  const [a, b] = await Promise.all([digest(given), digest(secret)])
  return crypto.subtle.timingSafeEqual(a, b)
}

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization')
  return header?.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : null
}

function cookie(request: Request, name: string): string | null {
  for (const part of (request.headers.get('cookie') ?? '').split(';')) {
    const index = part.indexOf('=')
    if (index > 0 && part.slice(0, index).trim() === name)
      return decodeURIComponent(part.slice(index + 1).trim())
  }
  return null
}

async function authorized(request: Request, token: string): Promise<boolean> {
  const url = new URL(request.url)
  for (const given of [bearer(request), cookie(request, COOKIE), url.searchParams.get('token')]) {
    if (await sameSecret(given, token))
      return true
  }
  return false
}

const LOGIN_PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Unlighthouse</title>
<style>body{font:16px system-ui,sans-serif;max-width:28rem;margin:15vh auto;padding:0 1rem;color:#222}input,button{font:inherit;padding:.5rem;width:100%;box-sizing:border-box;margin-top:.5rem}@media (prefers-color-scheme:dark){body{background:#111;color:#ddd}}</style>
</head><body><h1>Unlighthouse</h1><p>Enter the access token.</p>
<form method="get" action="/"><input name="token" type="password" autocomplete="current-password" required autofocus><button>Open dashboard</button></form>
</body></html>`

function unauthorized(request: Request): Response {
  const headers = { 'cache-control': 'no-store' }
  if (request.method === 'GET' && (request.headers.get('accept') ?? '').includes('text/html'))
    return new Response(LOGIN_PAGE, { status: 401, headers: { ...headers, 'content-type': 'text/html; charset=utf-8', 'x-frame-options': 'DENY' } })
  return Response.json({ ok: false, error: { code: 'UNAUTHORIZED', message: 'Missing or invalid token' } }, { status: 401, headers })
}

async function listKeys(bucket: R2Bucket, prefix: string): Promise<string[]> {
  const keys: string[] = []
  let cursor: string | undefined
  do {
    const page = await bucket.list({ prefix, ...(cursor ? { cursor } : {}) })
    keys.push(...page.objects.map(object => object.key))
    cursor = page.truncated ? page.cursor : undefined
  } while (cursor)
  return keys
}

async function syncStore(request: Request, env: Env): Promise<Response> {
  if (!(await sameSecret(bearer(request), env.UNLIGHTHOUSE_TOKEN)))
    return new Response('Unauthorized', { status: 401 })
  const url = new URL(request.url)
  if (url.pathname === '/') {
    if (request.method !== 'GET')
      return new Response('Method not allowed', { status: 405 })
    return Response.json({ keys: await listKeys(env.DATA, url.searchParams.get('prefix') ?? '') })
  }
  const key = url.pathname.slice(1).split('/').map(decodeURIComponent).join('/')
  if (!key || key.split('/').some(part => part === '' || part === '.' || part === '..'))
    return new Response('Bad key', { status: 400 })
  switch (request.method) {
    case 'GET': {
      const object = await env.DATA.get(key)
      return object ? new Response(object.body, { headers: { 'content-length': String(object.size) } }) : new Response('Not found', { status: 404 })
    }
    case 'PUT':
      await env.DATA.put(key, request.body)
      return new Response(null, { status: 204 })
    case 'DELETE':
      await env.DATA.delete(key)
      return new Response(null, { status: 204 })
    default:
      return new Response('Method not allowed', { status: 405 })
  }
}

export class UnlighthouseContainer extends Container<Env> {
  override defaultPort = PORT
  override sleepAfter = '5m'

  constructor(ctx: DurableObjectState<{}>, env: Env) {
    super(ctx, env)
    this.envVars = {
      UNLIGHTHOUSE_TOKEN: env.UNLIGHTHOUSE_TOKEN,
      UNLIGHTHOUSE_SYNC: `http://${SYNC_HOST}`,
      UNLIGHTHOUSE_SYNC_TOKEN: env.UNLIGHTHOUSE_TOKEN,
    }
    this.entrypoint = ['bun', '/app/src/cli.ts', 'serve', '--host', '0.0.0.0', '--port', String(PORT), '--allow-host', env.PUBLIC_HOST]
  }

  private async api<T>(operation: string, body: unknown): Promise<T> {
    const response = await this.containerFetch(`http://localhost/api/${operation}`, {
      method: 'POST',
      headers: { 'authorization': `Bearer ${this.env.UNLIGHTHOUSE_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }, PORT)
    const payload = await response.json<{ ok: boolean, data?: T, error?: { message: string } }>()
    if (!payload.ok)
      throw new Error(`${operation} failed: ${payload.error?.message ?? response.status}`)
    return payload.data as T
  }

  async busy(): Promise<boolean> {
    const totals = await Promise.all(BUSY_STATUSES.map(status => this.api<{ total: number }>('scans.list', { status, limit: 1 })))
    return totals.some(page => page.total > 0)
  }

  override async onActivityExpired(): Promise<void> {
    let working = false
    try {
      working = await this.busy()
    }
    catch (error) {
      console.error(JSON.stringify({ message: 'busy check failed; stopping', error: String(error) }))
    }
    if (working) {
      console.log(JSON.stringify({ message: 'scan running; staying awake' }))
      this.renewActivityTimeout()
      return
    }
    console.log(JSON.stringify({ message: 'idle; stopping container' }))
    await this.stop()
  }

  async wake(): Promise<{ startedMs: number, schedules: number, nextRunAt: number | null }> {
    const started = Date.now()
    await this.startAndWaitForPorts(PORT)
    const startedMs = Date.now() - started
    const schedules = await this.api<{ enabled: boolean, nextRunAt: number | null }[]>('schedules.list', {})
    const due = schedules.filter(schedule => schedule.enabled && schedule.nextRunAt !== null).map(schedule => schedule.nextRunAt!)
    const nextRunAt = due.length ? Math.min(...due) : null
    await this.env.DATA.put(STATE_KEY, JSON.stringify({ syncedAt: Date.now(), nextRunAt }))
    return { startedMs, schedules: schedules.length, nextRunAt }
  }
}

UnlighthouseContainer.outboundByHost = {
  [SYNC_HOST]: (request, env) => syncStore(request, env),
}

export default {
  async fetch(request, env): Promise<Response> {
    if (!(await authorized(request, env.UNLIGHTHOUSE_TOKEN)))
      return unauthorized(request)
    return getContainer(env.UNLIGHTHOUSE).fetch(request)
  },

  async scheduled(controller, env): Promise<void> {
    const object = await env.DATA.get(STATE_KEY)
    if (!object)
      return
    const state = await object.json<{ nextRunAt: number | null }>()
    if (state.nextRunAt === null || state.nextRunAt > controller.scheduledTime + 60_000)
      return
    const result = await getContainer(env.UNLIGHTHOUSE).wake()
    console.log(JSON.stringify({ message: 'woke Unlighthouse for a due schedule', due: state.nextRunAt, ...result }))
  },
} satisfies ExportedHandler<Env>
