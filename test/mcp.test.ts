import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Subprocess } from 'bun'
import { openStore } from '../src/db/index.ts'

const CLI = join(import.meta.dir, '../src/cli.ts')

let dir: string
let proc: Subprocess<'pipe', 'pipe', 'pipe'>
let scanId: string
const replies = new Map<number | string, Record<string, any>>()
const waiting = new Map<number | string, (reply: Record<string, any>) => void>()
let stdoutLines: string[] = []
let nextId = 1

async function readLines(): Promise<void> {
  const decoder = new TextDecoder()
  let buffer = ''
  for await (const chunk of proc.stdout) {
    buffer += decoder.decode(chunk, { stream: true })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
      stdoutLines.push(line)
      const message = JSON.parse(line) as Record<string, any>
      replies.set(message['id'], message)
      waiting.get(message['id'])?.(message)
    }
  }
}

function send(message: unknown): void {
  proc.stdin.write(`${typeof message === 'string' ? message : JSON.stringify(message)}\n`)
  proc.stdin.flush()
}

function request(method: string, params?: Record<string, unknown>): Promise<Record<string, any>> {
  const id = nextId++
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no reply to ${method}`)), 10_000)
    waiting.set(id, (reply) => {
      clearTimeout(timer)
      resolve(reply)
    })
    send({ jsonrpc: '2.0', id, method, ...(params ? { params } : {}) })
  })
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'unlighthouse-mcp-'))
  const store = openStore(join(dir, '.unlighthouse'))
  const scan = store.createScan({ origin: 'https://example.com', devices: ['mobile'], options: {} })
  store.updateScan(scan.id, { status: 'done' })
  scanId = scan.id
  store.close()
  proc = Bun.spawn(['bun', CLI, 'mcp'], { cwd: dir, stdin: 'pipe', stdout: 'pipe', stderr: 'pipe' })
  void readLines()
})

afterAll(async () => {
  proc.stdin.end()
  await Promise.race([proc.exited, Bun.sleep(5000)])
  proc.kill()
  expect(proc.exitCode).toBe(0)
  expect(await new Response(proc.stderr).text()).toContain('unlighthouse mcp: ready')
  rmSync(dir, { recursive: true, force: true })
})

describe('mcp over stdio', () => {
  test('initializes with a legacy handshake and negotiates the version', async () => {
    const reply = await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(reply['result']).toMatchObject({
      protocolVersion: '2025-06-18',
      capabilities: { tools: {} },
      serverInfo: { name: 'unlighthouse' },
    })
    expect(reply['result'].instructions).toContain('scans_summary')
    send({ jsonrpc: '2.0', method: 'notifications/initialized' })

    const unknownVersion = await request('initialize', { protocolVersion: '1999-01-01', capabilities: {}, clientInfo: { name: 'test', version: '1' } })
    expect(unknownVersion['result'].protocolVersion).toBe('2025-11-25')
    expect((await request('ping'))['result']).toEqual({})
  })

  test('answers server/discover and modern per-request metadata', async () => {
    const meta = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} }
    const discover = await request('server/discover', { _meta: meta })
    expect(discover['result']).toMatchObject({
      resultType: 'complete',
      supportedVersions: expect.arrayContaining(['2026-07-28', '2025-11-25']),
      capabilities: { tools: {} },
      _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'unlighthouse' } },
    })
    const list = await request('tools/list', { _meta: meta })
    expect(list['result']).toMatchObject({ resultType: 'complete', ttlMs: expect.any(Number), cacheScope: 'public' })

    const unsupported = await request('tools/list', { _meta: { ...meta, 'io.modelcontextprotocol/protocolVersion': '2099-01-01' } })
    expect(unsupported['error']).toMatchObject({ code: -32022, data: { requested: '2099-01-01', supported: expect.arrayContaining(['2026-07-28']) } })
  })

  test('lists every operation as a tool with JSON Schema input', async () => {
    const reply = await request('tools/list')
    const tools = reply['result'].tools as Array<Record<string, any>>
    const names = tools.map(tool => tool['name'])
    expect(names).toEqual(expect.arrayContaining(['sites_list', 'scans_start', 'scans_wait', 'scans_summary', 'pages_get', 'issues_list', 'compare', 'budgets_check', 'scans_templates']))
    const start = tools.find(tool => tool['name'] === 'scans_start')!
    expect(start['inputSchema']).toMatchObject({ type: 'object', required: ['site'] })
    expect(start['outputSchema']).toMatchObject({ type: 'object' })
    expect(start['annotations']).toMatchObject({ readOnlyHint: false, openWorldHint: true })
    const summary = tools.find(tool => tool['name'] === 'scans_summary')!
    expect(summary['annotations'].readOnlyHint).toBe(true)
    expect(summary['description']).toContain('first')
  })

  test('calls tools with structured content and reports tool errors as isError', async () => {
    const sites = await request('tools/call', { name: 'sites_list', arguments: {} })
    expect(sites['result'].isError).toBe(false)
    expect(sites['result'].structuredContent.items[0].origin).toBe('https://example.com')
    expect(JSON.parse(sites['result'].content[0].text)[0].origin).toBe('https://example.com')

    const scan = await request('tools/call', { name: 'scans_get', arguments: { scanId } })
    expect(scan['result'].structuredContent).toMatchObject({ id: scanId, status: 'done' })

    const missing = await request('tools/call', { name: 'scans_get', arguments: { scanId: 'nope' } })
    expect(missing['result'].isError).toBe(true)
    expect(missing['result'].content[0].text).toContain('NOT_FOUND')

    const invalid = await request('tools/call', { name: 'scans_get', arguments: {} })
    expect(invalid['result'].isError).toBe(true)
    expect(invalid['result'].content[0].text).toContain('INVALID_INPUT')
  })

  test('returns JSON-RPC errors for protocol mistakes and logs only to stderr', async () => {
    expect((await request('tools/call', { name: 'nope' }))['error'].code).toBe(-32602)
    expect((await request('resources/list'))['error'].code).toBe(-32601)
    send('{not json')
    await Bun.sleep(200)
    expect(replies.get(null as unknown as number)?.['error'].code).toBe(-32700)
    for (const line of stdoutLines)
      expect(JSON.parse(line).jsonrpc).toBe('2.0')
  })
})
