import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Store } from '../src/contracts.ts'
import { openStore } from '../src/db/index.ts'
import { EventBus } from '../src/events.ts'
import type { UnlighthouseEvent } from '../src/events.ts'
import { createScanner } from '../src/scan/runner.ts'
import type { Scanner } from '../src/scan/runner.ts'
import type { UnlighthouseServer } from '../src/server/app.ts'
import { createServer } from '../src/server/app.ts'
import { createFakePool, fakeResult } from './fixtures/fake-pool.ts'

const TOKEN = 'test-token-0123456789'

let dir: string
let store: Store
let bus: EventBus
let scanner: Scanner
let server: UnlighthouseServer
let scanId: string
const pageUrl = 'https://example.com/'

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'unlighthouse-server-'))
  store = openStore(join(dir, 'data'))
  bus = new EventBus()
  scanner = createScanner({ store, bus, createPool: createFakePool().createPool })
  const scan = store.createScan({ origin: 'https://example.com', devices: ['mobile'], options: {} })
  scanId = scan.id
  store.insertPages(scan.id, [{ url: pageUrl, path: '/', template: '/', device: 'mobile', status: 'queued' }])
  const result = fakeResult({ url: pageUrl, device: 'mobile', categories: [], throttling: 'simulate', samples: 1, timeoutMs: 1, concurrency: 1, chromeFlags: [], auth: { headers: {}, cookies: [], localStorage: {}, sessionStorage: {} } }, 0.9)
  store.savePageResult(scan.id, pageUrl, 'mobile', { ...result, report: new Uint8Array(readFileSync(join(import.meta.dir, 'fixtures/lhr-mobile.json.gz'))) })
  store.updateScan(scan.id, { status: 'done' })
  server = createServer({ store, scanner, bus, port: 0, token: TOKEN })
})

afterAll(async () => {
  await server.stop()
  await scanner.close()
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

function api(operation: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return fetch(`${server.url}/api/${operation}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

const bearer = { authorization: `Bearer ${TOKEN}` }

const BunWebSocket = WebSocket as unknown as new (url: string, options?: { headers: Record<string, string> }) => WebSocket

describe('server', () => {
  test('binds to loopback and prints a token URL', () => {
    expect(server.url).toBe(`http://127.0.0.1:${server.port}`)
    expect(server.loginUrl).toBe(`${server.url}/?token=${TOKEN}`)
    expect(server.exposed).toBe(false)
  })

  test('requires the token for the API', async () => {
    const anonymous = await api('sites.list', {})
    expect(anonymous.status).toBe(401)
    expect(await anonymous.json()).toMatchObject({ ok: false, error: { code: 'UNAUTHORIZED' } })
    expect((await api('sites.list', {}, { authorization: 'Bearer wrong' })).status).toBe(401)

    const ok = await api('sites.list', {}, bearer)
    expect(ok.status).toBe(200)
    const body = await ok.json() as { ok: boolean, data: Array<{ origin: string }> }
    expect(body.ok).toBe(true)
    expect(body.data[0]!.origin).toBe('https://example.com')
  })

  test('the token URL sets an HttpOnly SameSite=Strict cookie that authorizes later requests', async () => {
    const login = await fetch(`${server.url}/?token=${TOKEN}`, { redirect: 'manual' })
    expect(login.status).toBe(303)
    expect(login.headers.get('location')).toBe('/')
    const cookie = login.headers.get('set-cookie')!
    expect(cookie).toContain('HttpOnly')
    expect(cookie).toContain('SameSite=Strict')
    const pair = cookie.split(';')[0]!
    expect(pair).toBe(`unlighthouse_token_${server.port}=${TOKEN}`)

    const withCookie = await api('scans.get', { scanId }, { cookie: pair })
    expect(withCookie.status).toBe(200)
    expect((await fetch(`${server.url}/?token=nope`, { redirect: 'manual' })).status).toBe(401)
  })

  test('rejects foreign Host headers (DNS rebinding) and cross-origin requests', async () => {
    const rebound = await api('sites.list', {}, { ...bearer, host: `evil.example:${server.port}` })
    expect(rebound.status).toBe(403)
    expect((await fetch(`${server.url}/`, { headers: { host: 'evil.example' } })).status).toBe(403)
    expect((await api('sites.list', {}, { ...bearer, host: `localhost:${server.port}` })).status).toBe(200)

    const crossOrigin = await api('sites.list', {}, { ...bearer, origin: 'https://evil.example' })
    expect(crossOrigin.status).toBe(403)
    expect((await api('sites.list', {}, { ...bearer, origin: 'null' })).status).toBe(403)
    expect((await api('sites.list', {}, { ...bearer, 'sec-fetch-site': 'cross-site' })).status).toBe(403)
    expect((await api('sites.list', {}, { ...bearer, origin: server.url })).status).toBe(200)
  })

  test('maps errors to stable codes and HTTP statuses', async () => {
    const unknown = await api('nope', {}, bearer)
    expect(unknown.status).toBe(404)
    expect(await unknown.json()).toMatchObject({ ok: false, error: { code: 'NOT_FOUND' } })

    const invalid = await api('scans.get', { scanId: 42 }, bearer)
    expect(invalid.status).toBe(400)
    expect(await invalid.json()).toMatchObject({ error: { code: 'INVALID_INPUT' } })

    const badJson = await fetch(`${server.url}/api/sites.list`, { method: 'POST', headers: bearer, body: '{' })
    expect(badJson.status).toBe(400)

    const missing = await api('scans.get', { scanId: 'missing' }, bearer)
    expect(missing.status).toBe(404)

    expect((await fetch(`${server.url}/api/sites.list`, { headers: bearer })).status).toBe(405)
  })

  test('serves the dashboard with an SPA fallback', async () => {
    for (const path of ['/', '/scans/abc/pages']) {
      const response = await fetch(`${server.url}${path}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('text/html')
      expect(await response.text()).toContain('<div id="root">')
    }
  }, 30_000)

  test('renders the stored Lighthouse report with Lighthouse\'s own viewer', async () => {
    const path = `/report/${scanId}/mobile?url=${encodeURIComponent(pageUrl)}`
    expect((await fetch(`${server.url}${path}`)).status).toBe(401)
    const response = await fetch(`${server.url}${path}`, { headers: bearer })
    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain('sandbox')
    const html = await response.text()
    expect(html).toContain('__LIGHTHOUSE_JSON__')
    expect(html.length).toBeGreaterThan(100_000)
    expect((await fetch(`${server.url}/report/${scanId}/mobile?url=${encodeURIComponent('https://example.com/other')}`, { headers: bearer })).status).toBe(404)
    expect((await fetch(`${server.url}/report/${scanId}/tablet?url=x`, { headers: bearer })).status).toBe(400)
  })

  test('serves pages.csv and issues.csv of a scan behind the token', async () => {
    expect((await fetch(`${server.url}/export/${scanId}/pages.csv`)).status).toBe(401)
    const pages = await fetch(`${server.url}/export/${scanId}/pages.csv`, { headers: bearer })
    expect(pages.status).toBe(200)
    expect(pages.headers.get('content-type')).toStartWith('text/csv')
    expect(pages.headers.get('content-disposition')).toBe(`attachment; filename="unlighthouse-${scanId}-pages.csv"`)
    const lines = (await pages.text()).split('\r\n')
    expect(lines[0]).toStartWith('url,template,device,status,score_performance,')
    expect(lines[1]).toStartWith(`${pageUrl},/,mobile,done,0.9,`)
    const issues = await fetch(`${server.url}/export/${scanId}/issues.csv?bom=1`, { headers: bearer })
    expect(issues.status).toBe(200)
    expect(new Uint8Array(await issues.arrayBuffer()).slice(0, 3)).toEqual(new Uint8Array([0xEF, 0xBB, 0xBF]))
    expect((await fetch(`${server.url}/export/${scanId}/findings.csv`, { headers: bearer })).status).toBe(404)
    expect((await fetch(`${server.url}/export/missing/pages.csv`, { headers: bearer })).status).toBe(404)
    expect((await fetch(`${server.url}/export/${scanId}/pages.csv`, { method: 'POST', headers: bearer })).status).toBe(405)
  })

  test('streams scan events over an authenticated WebSocket', async () => {
    const wsUrl = `${server.url.replace('http', 'ws')}/ws`
    const refused = await new Promise<string>((resolve) => {
      const ws = new BunWebSocket(wsUrl)
      ws.onopen = () => resolve('open')
      ws.onerror = () => resolve('error')
    })
    expect(refused).toBe('error')

    const crossOrigin = await new Promise<string>((resolve) => {
      const ws = new BunWebSocket(wsUrl, { headers: { ...bearer, origin: 'https://evil.example' } })
      ws.onopen = () => resolve('open')
      ws.onerror = () => resolve('error')
    })
    expect(crossOrigin).toBe('error')

    const ws = new BunWebSocket(wsUrl, { headers: bearer })
    await new Promise<void>((resolve, reject) => {
      ws.onopen = () => resolve()
      ws.onerror = () => reject(new Error('websocket failed'))
    })
    const received: UnlighthouseEvent[] = []
    ws.onmessage = message => received.push(JSON.parse(String(message.data)))
    ws.send(JSON.stringify({ subscribe: 'scan-a' }))
    await Bun.sleep(50)
    bus.emit({ type: 'scan:status', scanId: 'scan-b', status: 'auditing' })
    bus.emit({ type: 'scan:status', scanId: 'scan-a', status: 'done' })
    ws.send(JSON.stringify({ unsubscribe: 'scan-a' }))
    await Bun.sleep(50)
    bus.emit({ type: 'scan:status', scanId: 'scan-a', status: 'failed' })
    await Bun.sleep(50)
    ws.close()
    expect(received).toEqual([{ type: 'scan:status', scanId: 'scan-a', status: 'done' }])
  })
})

describe('server on all interfaces', () => {
  test('marks itself exposed and still requires the token', async () => {
    const exposed = createServer({ store, scanner, bus, host: '0.0.0.0', port: 0, token: TOKEN, allowedHosts: ['unlighthouse.lan'] })
    try {
      expect(exposed.exposed).toBe(true)
      const url = `http://127.0.0.1:${exposed.port}/api/sites.list`
      expect((await fetch(url, { method: 'POST', body: '{}' })).status).toBe(401)
      expect((await fetch(url, { method: 'POST', body: '{}', headers: { ...bearer, host: 'unlighthouse.lan' } })).status).toBe(200)
      expect((await fetch(url, { method: 'POST', body: '{}', headers: { ...bearer, host: 'other.lan' } })).status).toBe(403)
    }
    finally {
      await exposed.stop()
    }
  })
})
