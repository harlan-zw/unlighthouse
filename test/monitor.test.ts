import { afterAll, afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { main } from '../src/cli.ts'
import { parseConfig } from '../src/config.ts'
import type { Store } from '../src/contracts.ts'
import { openStore } from '../src/db/index.ts'
import { UnlighthouseError } from '../src/errors.ts'
import { EventBus } from '../src/events.ts'
import { describeTools } from '../src/mcp/server.ts'
import { operations } from '../src/ops/operations.ts'
import type { OperationContext } from '../src/ops/registry.ts'
import { invoke } from '../src/ops/registry.ts'
import { cronError, nextRun } from '../src/scan/cron.ts'
import type { NotificationMessage, Notifier } from '../src/scan/notify.ts'
import { createNotifier, deliver, SIGNATURE_HEADER, testMessage, verifySignature } from '../src/scan/notify.ts'
import type { Scanner } from '../src/scan/runner.ts'
import { createScanner } from '../src/scan/runner.ts'
import { createScheduler, syncSchedules } from '../src/scan/scheduler.ts'
import type { NotificationChannel, Schedule } from '../src/types.ts'
import type { FakePool } from './fixtures/fake-pool.ts'
import { createFakePool } from './fixtures/fake-pool.ts'
import { servePages } from './fixtures/pages.ts'

const site = servePages(['/', '/about', '/blog/post-1'])

interface Received {
  path: string
  headers: Headers
  body: string
}

const received: Received[] = []
let failures = 0
let failStatus = 500
let hang = false

const receiver = Bun.serve({
  port: 0,
  hostname: '127.0.0.1',
  async fetch(request) {
    const path = new URL(request.url).pathname
    received.push({ path, headers: request.headers, body: await request.text() })
    if (hang)
      await Bun.sleep(500)
    if (failures > 0) {
      failures--
      return new Response('nope', { status: failStatus })
    }
    return new Response('ok')
  },
})
const hook = (path: string) => `http://127.0.0.1:${receiver.port}${path}`

afterAll(() => {
  site.stop()
  receiver.stop(true)
})

const HOUR = 3_600_000
const fast = { attempts: 3, backoffMs: 1, timeoutMs: 2000 }

let dir: string
let store: Store
let bus: EventBus
let fake: FakePool
let scanner: Scanner
let notifier: Notifier
let performance = 0.8
let env: Record<string, string> = {}

function channel(overrides: Partial<NotificationChannel> = {}): NotificationChannel {
  return { id: 'hook', type: 'webhook', url: hook('/hook'), secret: null, on: ['scan-done'], sites: null, source: 'api', createdAt: 1, ...overrides }
}

function schedule(overrides: Partial<Schedule> = {}): Schedule {
  return {
    id: 'nightly',
    site: site.origin,
    cron: '0 * * * *',
    devices: null,
    overrides: {},
    enabled: true,
    source: 'api',
    lastRunAt: null,
    nextRunAt: null,
    lastScanId: null,
    lastError: null,
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  }
}

function ctx(): OperationContext {
  return { store, scanner, notifier }
}

function call(name: string, input: unknown = {}): Promise<any> {
  return invoke(operations, ctx(), name, input)
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'unlighthouse-monitor-'))
  store = openStore(join(dir, 'data'))
  bus = new EventBus()
  performance = 0.8
  received.length = 0
  failures = 0
  failStatus = 500
  hang = false
  env = { HOOK: hook('/secret-path-123'), HOOK_SECRET: 's3cret-value' }
  fake = createFakePool({ performance: () => performance, delayMs: 20 })
  scanner = createScanner({ store, bus, createPool: fake.createPool, cpus: 12 })
  notifier = createNotifier({ store, bus, env, publicUrl: 'https://unlighthouse.example.com/', ...fast })
})

afterEach(async () => {
  await scanner.close()
  await notifier.close()
  store.close()
  rmSync(dir, { recursive: true, force: true })
})

describe('cron', () => {
  test('validates expressions and rejects runs less than 15 minutes apart', () => {
    expect(cronError('*/15 * * * *')).toBeNull()
    expect(cronError('0 3 * * MON-FRI')).toBeNull()
    expect(cronError('@daily')).toBeNull()
    expect(cronError('* * * *')).toContain('5 space-separated fields')
    expect(cronError('61 * * * *')).toContain('out of range')
    expect(cronError('0 0 30 2 *')).toContain('never matches')
    expect(cronError('*/5 * * * *')).toContain('at least 15 minutes')
    expect(cronError('0,10 9 * * *')).toContain('10 minute(s) apart')
    expect(cronError('55 * * * *')).toBeNull()
    expect(() => parseConfig({ schedules: [{ site: site.origin, cron: '* * * * *' }] })).toThrow('at least 15 minutes')
  })

  test('computes the next run strictly after a moment', () => {
    const from = Date.UTC(2026, 0, 1, 10, 7)
    expect(nextRun('*/15 * * * *', from)).toBe(Date.UTC(2026, 0, 1, 10, 15))
    expect(nextRun('0 * * * *', Date.UTC(2026, 0, 1, 10))).toBe(Date.UTC(2026, 0, 1, 11))
    expect(nextRun('0 0 30 2 *', from)).toBeNull()
  })
})

describe('scheduler', () => {
  test('runs a schedule missed while the server was down once, not once per missed slot', async () => {
    const now = Date.UTC(2026, 5, 1, 12, 30)
    store.saveSchedule(schedule({ nextRunAt: now - 5 * HOUR, lastRunAt: now - 6 * HOUR }))
    const scheduler = createScheduler({ store, scanner, bus, now: () => now })
    try {
      const started = scheduler.start()
      expect(started).toHaveLength(1)
      expect(scheduler.tick()).toEqual([])
      const saved = store.getSchedule('nightly')!
      expect(saved.lastRunAt).toBe(now)
      expect(saved.lastScanId).toBe(started[0]!)
      expect(saved.nextRunAt).toBe(nextRun('0 * * * *', now))
      const scan = await scanner.wait(started[0]!, 10_000)
      expect(scan).toMatchObject({ status: 'done', label: 'schedule nightly', origin: site.origin })
    }
    finally {
      scheduler.stop()
    }
  })

  test('only schedules a first run for new schedules and skips disabled ones', () => {
    const now = Date.UTC(2026, 5, 1, 12, 30)
    store.saveSchedule(schedule())
    store.saveSchedule(schedule({ id: 'off', enabled: false, nextRunAt: now - HOUR }))
    const scheduler = createScheduler({ store, scanner, bus, now: () => now })
    expect(scheduler.tick()).toEqual([])
    expect(store.getSchedule('nightly')!.nextRunAt).toBe(Date.UTC(2026, 5, 1, 13))
    expect(store.getSchedule('off')!.lastRunAt).toBeNull()
  })

  test('sends due schedules through the queue one scan at a time and skips a schedule whose scan is pending', async () => {
    let now = Date.UTC(2026, 5, 1, 12, 30)
    store.saveSchedule(schedule({ id: 'a', nextRunAt: now - 1, devices: ['mobile', 'desktop'], overrides: { sampling: { perTemplate: 1 } } }))
    store.saveSchedule(schedule({ id: 'b', nextRunAt: now - 1, cron: '*/30 * * * *', overrides: { label: 'custom' } }))
    const scheduler = createScheduler({ store, scanner, bus, now: () => now })
    const [first, second] = scheduler.tick()
    expect(scanner.active()).toBe(first!)
    expect(store.getScan(second!)!.status).toBe('queued')

    now += HOUR
    expect(scheduler.tick()).toEqual([])
    expect(store.getSchedule('a')!.lastError).toContain('still')
    expect(store.getSchedule('a')!.lastScanId).toBe(first!)

    await scanner.wait(second!, 10_000)
    await scanner.idle()
    const a = store.getScan(first!)!
    const b = store.getScan(second!)!
    expect(a).toMatchObject({ status: 'done', devices: ['mobile', 'desktop'], label: 'schedule a' })
    expect((a.options as { sampling: { perTemplate: number } }).sampling.perTemplate).toBe(1)
    expect(b).toMatchObject({ status: 'done', label: 'custom' })
    expect(b.startedAt!).toBeGreaterThanOrEqual(a.finishedAt!)

    now += HOUR
    expect(scheduler.tick()).toHaveLength(2)
    scheduler.stop()
  })

  test('syncs config schedules, keeping run history and removing dropped entries', () => {
    const parse = (raw: unknown) => raw as Record<string, unknown>
    const now = Date.UTC(2026, 5, 1, 12, 30)
    const first = syncSchedules(store, [{ id: 'cfg', site: site.origin, cron: '0 3 * * *' }, { site: site.origin, cron: '0 4 * * *' }], parse, now)
    expect(first.added).toHaveLength(2)
    expect(store.getSchedule('cfg')).toMatchObject({ source: 'config', nextRunAt: nextRun('0 3 * * *', now) })
    store.patchSchedule('cfg', { lastRunAt: now, lastScanId: 'x' })

    const second = syncSchedules(store, [{ id: 'cfg', site: site.origin, cron: '0 3 * * *', devices: ['desktop'] }], parse, now + HOUR)
    expect(second).toMatchObject({ added: [], updated: ['cfg'], removed: [expect.stringContaining('127.0.0.1-')] })
    expect(store.getSchedule('cfg')).toMatchObject({ lastRunAt: now, lastScanId: 'x', devices: ['desktop'], nextRunAt: nextRun('0 3 * * *', now) })

    store.saveSchedule(schedule({ id: 'mine' }))
    expect(() => syncSchedules(store, [{ id: 'mine', site: site.origin, cron: '0 3 * * *' }], parse)).toThrow('API')
    expect(() => syncSchedules(store, [{ id: 'cfg', site: site.origin, cron: '0 3 * * *' }, { id: 'cfg', site: site.origin, cron: '0 5 * * *' }], parse)).toThrow('share the id')
  })
})

describe('schedule operations', () => {
  test('create, update, run and delete schedules', async () => {
    await expect(call('schedules.create', { site: site.origin, cron: '*/5 * * * *' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(call('schedules.create', { site: site.origin, cron: 'nope' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    const created = await call('schedules.create', { id: 'daily', site: site.origin, cron: '0 3 * * *', devices: ['desktop'], overrides: { samples: 2, chromePath: '/bin/sh' } })
    expect(created).toMatchObject({ id: 'daily', source: 'api', enabled: true, overrides: { samples: 2 } })
    expect(created.overrides).not.toHaveProperty('chromePath')
    expect(created.nextRunAt).toBeGreaterThan(Date.now())
    await expect(call('schedules.create', { id: 'daily', site: site.origin, cron: '0 3 * * *' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })

    const disabled = await call('schedules.update', { id: 'daily', enabled: false })
    expect(disabled).toMatchObject({ enabled: false, nextRunAt: null })
    const retimed = await call('schedules.update', { id: 'daily', enabled: true, cron: '30 4 * * *', devices: null })
    expect(retimed).toMatchObject({ cron: '30 4 * * *', devices: null })
    expect(retimed.nextRunAt).toBe(nextRun('30 4 * * *', Date.now()))

    const { scan } = await call('schedules.runNow', { id: 'daily' })
    await expect(call('schedules.runNow', { id: 'daily' })).rejects.toMatchObject({ code: 'SCAN_ACTIVE' })
    expect((await call('scans.wait', { scanId: scan.id, timeoutMs: 10_000 })).status).toBe('done')
    expect((await call('schedules.list'))[0]).toMatchObject({ id: 'daily', lastScanId: scan.id, nextRunAt: retimed.nextRunAt })

    syncSchedules(store, [{ id: 'cfg', site: site.origin, cron: '0 3 * * *' }], raw => raw as Record<string, unknown>)
    await expect(call('schedules.update', { id: 'cfg', enabled: false })).rejects.toThrow('config file')
    await expect(call('schedules.delete', { id: 'cfg' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    expect(await call('schedules.delete', { id: 'daily' })).toEqual({ deleted: 'daily' })
    await expect(call('schedules.delete', { id: 'daily' })).rejects.toMatchObject({ code: 'NOT_FOUND' })
  })

  test('config.schema returns the scan options without keys the API ignores', async () => {
    const schema = await call('config.schema')
    expect(Object.keys(schema.properties)).toEqual(expect.arrayContaining(['site', 'devices', 'discover', 'sampling', 'budgets', 'throttling']))
    for (const key of ['auth', 'chromePath', 'chromeFlags', 'dataDir', 'schedules', 'notifications', 'publicUrl'])
      expect(schema.properties).not.toHaveProperty(key)
    expect(schema.properties.devices.default).toEqual(['mobile'])
  })

  test('mcp tools describe the new operations with fitting hints', () => {
    const tools = describeTools(operations)
    const byName = new Map(tools.map(tool => [tool.title, tool]))
    expect(byName.get('schedules.delete')!.annotations.destructiveHint).toBe(true)
    expect(byName.get('notifications.test')!.annotations.openWorldHint).toBe(true)
    expect(byName.get('notifications.log')!.annotations.readOnlyHint).toBe(true)
    expect(byName.get('config.schema')!.name).toBe('config_schema')
  })
})

function message(): NotificationMessage {
  return { ...testMessage(site.origin), test: false, events: ['scan-done', 'regression'], title: 'Unlighthouse: x regressed', text: 'mobile: Performance 70 (-10)' }
}

describe('notification delivery', () => {
  test('posts native Slack and Discord payloads', async () => {
    const slack = await deliver(channel({ type: 'slack', url: hook('/slack') }), { ...message(), link: 'https://k.example/scans/1' }, { env, ...fast })
    const discord = await deliver(channel({ type: 'discord', url: hook('/discord') }), message(), { env, ...fast })
    expect(slack).toEqual({ status: 'sent', attempts: 1, httpStatus: 200, error: null })
    expect(discord.status).toBe('sent')
    const slackBody = JSON.parse(received.find(entry => entry.path === '/slack')!.body)
    expect(slackBody.text).toBe('Unlighthouse: x regressed')
    expect(slackBody.blocks[0]).toEqual({ type: 'header', text: { type: 'plain_text', text: 'Unlighthouse: x regressed' } })
    expect(slackBody.blocks[1].text).toEqual({ type: 'mrkdwn', text: 'mobile: Performance 70 (-10)' })
    expect(slackBody.blocks[2].text.text).toBe('<https://k.example/scans/1|Open in Unlighthouse>')
    const discordBody = JSON.parse(received.find(entry => entry.path === '/discord')!.body)
    expect(discordBody.allowed_mentions).toEqual({ parse: [] })
    expect(discordBody.embeds[0]).toMatchObject({ title: 'Unlighthouse: x regressed', description: 'mobile: Performance 70 (-10)', color: 0xDC2626 })
  })

  test('signs generic webhooks with HMAC-SHA256 when a secret is set', async () => {
    const outcome = await deliver(channel({ url: 'env:HOOK', secret: 'env:HOOK_SECRET' }), message(), { env, ...fast })
    expect(outcome.status).toBe('sent')
    const request = received[0]!
    expect(request.path).toBe('/secret-path-123')
    const body = JSON.parse(request.body)
    expect(body).toMatchObject({ type: 'unlighthouse.notification', events: ['scan-done', 'regression'], site: site.origin })
    expect(request.headers.get('x-unlighthouse-event')).toBe('scan-done,regression')
    expect(verifySignature('s3cret-value', request.body, request.headers.get(SIGNATURE_HEADER))).toBe(true)
    expect(verifySignature('other', request.body, request.headers.get(SIGNATURE_HEADER))).toBe(false)
    expect(verifySignature('s3cret-value', `${request.body} `, request.headers.get(SIGNATURE_HEADER))).toBe(false)

    await deliver(channel(), message(), { env, ...fast })
    expect(received[1]!.headers.get(SIGNATURE_HEADER)).toBeNull()
  })

  test('retries server errors with backoff, gives up on client errors and times out', async () => {
    failures = 2
    expect(await deliver(channel(), message(), { env, ...fast })).toEqual({ status: 'sent', attempts: 3, httpStatus: 200, error: null })
    failures = 5
    expect(await deliver(channel(), message(), { env, ...fast })).toEqual({ status: 'failed', attempts: 3, httpStatus: 500, error: 'HTTP 500' })
    failures = 5
    failStatus = 404
    expect(await deliver(channel(), message(), { env, ...fast })).toEqual({ status: 'failed', attempts: 1, httpStatus: 404, error: 'HTTP 404' })

    failures = 0
    hang = true
    const slow = await deliver(channel(), message(), { env, attempts: 2, backoffMs: 1, timeoutMs: 50 })
    expect(slow).toEqual({ status: 'failed', attempts: 2, httpStatus: null, error: 'No response within 50 ms' })

    const timings: number[] = []
    let calls = 0
    const timedFetch = (async () => {
      timings.push(Date.now())
      calls++
      return new Response('', { status: calls < 3 ? 503 : 200 })
    }) as unknown as typeof fetch
    expect((await deliver(channel(), message(), { env, fetch: timedFetch, attempts: 3, backoffMs: 40 })).attempts).toBe(3)
    expect(timings[1]! - timings[0]!).toBeGreaterThanOrEqual(35)
    expect(timings[2]! - timings[1]!).toBeGreaterThanOrEqual(75)
  })

  test('fails without sending when the env reference is missing, and never leaks the URL in errors', async () => {
    expect(await deliver(channel({ url: 'env:MISSING' }), message(), { env, ...fast })).toEqual({ status: 'failed', attempts: 0, httpStatus: null, error: 'The environment variable MISSING is not set' })
    const refused = await deliver(channel({ url: 'http://127.0.0.1:1/token-abc' }), message(), { env, ...fast })
    expect(refused.status).toBe('failed')
    expect(refused.error).not.toContain('token-abc')
  })
})

describe('notification operations', () => {
  test('never return secrets and keep a delivery log', async () => {
    const created = await call('notifications.create', { id: 'ops', type: 'webhook', url: hook('/literal-token-xyz'), secret: 'plain-secret', on: ['scan-failed'] })
    expect(created).toMatchObject({ id: 'ops', url: `http://127.0.0.1:${receiver.port}/[redacted]`, secret: '[redacted]' })
    await call('notifications.create', { id: 'slack', type: 'slack', url: 'env:HOOK', secret: 'env:HOOK_SECRET' })
    await expect(call('notifications.create', { type: 'slack', url: 'ftp://nope' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })
    await expect(call('notifications.create', { id: 'slack', type: 'slack', url: 'env:HOOK' })).rejects.toMatchObject({ code: 'INVALID_INPUT' })

    const listed = JSON.stringify(await call('notifications.list'))
    expect(listed).not.toContain('literal-token-xyz')
    expect(listed).not.toContain('plain-secret')
    expect(listed).toContain('env:HOOK_SECRET')

    const updated = await call('notifications.update', { id: 'slack', on: ['scan-done'], sites: [`${site.origin}/any/path`], secret: null })
    expect(updated).toMatchObject({ on: ['scan-done'], sites: [site.origin], secret: null })

    const delivery = await call('notifications.test', { id: 'ops' })
    expect(delivery).toMatchObject({ notificationId: 'ops', status: 'sent', attempts: 1, httpStatus: 200, scanId: null })
    expect(JSON.parse(received[0]!.body)).toMatchObject({ test: true })
    await expect(call('notifications.test', { id: 'missing' })).rejects.toMatchObject({ code: 'NOT_FOUND' })

    const log = await call('notifications.log', { notificationId: 'ops' })
    expect(log.total).toBe(1)
    expect(JSON.stringify(log)).not.toContain('literal-token-xyz')
    expect(await call('notifications.delete', { id: 'ops' })).toEqual({ deleted: 'ops' })
    expect((await call('notifications.log', {})).total).toBe(1)
  })

  test('config channels are listed, redacted and read-only', async () => {
    const configured = createNotifier({ store, env, channels: [{ id: 'cfg', type: 'discord', url: 'https://discord.example/api/webhooks/1/secret' }] })
    const list = await invoke(operations, { store, scanner, notifier: configured }, 'notifications.list', {}) as NotificationChannel[]
    expect(list).toEqual([expect.objectContaining({ id: 'cfg', source: 'config', url: 'https://discord.example/[redacted]', on: ['scan-failed', 'regression', 'budget-failed'] })])
    await expect(invoke(operations, { store, scanner, notifier: configured }, 'notifications.delete', { id: 'cfg' })).rejects.toThrow('config file')
    await configured.close()
  })
})

describe('notifications after scans', () => {
  async function scan(input: Record<string, unknown> = {}) {
    const started = scanner.start({ site: site.origin, ...input })
    await scanner.wait(started.id, 10_000)
    await notifier.idle()
    return started.id
  }

  test('send matching events with scores, deltas, regressions and a dashboard link', async () => {
    store.saveNotification(channel({ id: 'all', url: 'env:HOOK', on: ['scan-done', 'regression', 'budget-failed', 'new-issues'] }))
    store.saveNotification(channel({ id: 'alerts', type: 'slack', url: hook('/slack'), on: ['regression'] }))
    store.saveNotification(channel({ id: 'elsewhere', url: hook('/elsewhere'), on: ['scan-done'], sites: ['https://example.com'] }))

    const base = await scan()
    expect(received.map(entry => entry.path)).toEqual(['/secret-path-123'])
    const first = JSON.parse(received[0]!.body)
    expect(first.events).toEqual(['scan-done'])
    expect(first.link).toBe(`https://unlighthouse.example.com/scans/${base}`)
    expect(first.devices[0]).toMatchObject({ device: 'mobile', scores: { performance: 0.8 } })

    received.length = 0
    performance = 0.5
    const head = await scan({ budgets: { scores: { performance: 0.9 } } })
    expect(received.map(entry => entry.path).sort()).toEqual(['/secret-path-123', '/slack'])
    const generic = JSON.parse(received.find(entry => entry.path === '/secret-path-123')!.body)
    expect(generic.events).toEqual(['scan-done', 'regression', 'budget-failed'])
    expect(generic.baseline).toBe(base)
    expect(generic.devices[0].deltas.performance).toBeCloseTo(-0.3)
    expect(generic.regressions.length).toBeGreaterThan(0)
    expect(generic.failedBudgets[0]).toMatchObject({ limit: 0.9 })
    expect(generic.text).toContain('Performance 50 (-30)')
    const slack = JSON.parse(received.find(entry => entry.path === '/slack')!.body)
    expect(slack.text).toContain('regressed')
    expect(JSON.stringify(slack.blocks)).toContain(`/scans/${head}|Open in Unlighthouse`)

    const log = store.listDeliveries({ scanId: head, limit: 10, offset: 0 })
    expect(log.items.map(item => [item.notificationId, item.events])).toEqual(expect.arrayContaining([
      ['alerts', ['regression']],
      ['all', ['scan-done', 'regression', 'budget-failed']],
    ]))
  })

  test('report failed scans and never fail the scan when delivery fails', async () => {
    store.saveNotification(channel({ id: 'down', url: 'http://127.0.0.1:1/x', on: ['scan-failed', 'scan-done'] }))
    store.saveNotification(channel({ id: 'failures', url: hook('/failures'), on: ['scan-failed'] }))
    const failing = createFakePool({ fail: () => new UnlighthouseError('AUDIT_FAILED', 'boom') })
    await scanner.close()
    scanner = createScanner({ store, bus, createPool: failing.createPool, cpus: 12 })
    const id = await scan()
    expect(store.getScan(id)!.status).toBe('failed')
    const body = JSON.parse(received[0]!.body)
    expect(body).toMatchObject({ events: ['scan-failed'], scan: { id, status: 'failed' } })
    expect(body.text).toContain('boom')
    expect(store.listDeliveries({ notificationId: 'down', limit: 5, offset: 0 }).items[0]).toMatchObject({ status: 'failed', attempts: 3 })
  })
})

describe('cli', () => {
  async function run(argv: string[]) {
    let stdout = ''
    let stderr = ''
    const code = await main(argv, {
      createPool: createFakePool().createPool,
      cwd: dir,
      env,
      handleSignals: false,
      stdout: { write: (text: string) => (stdout += text) },
      stderr: { write: (text: string) => (stderr += text) },
    })
    return { code, stdout, stderr }
  }

  test('schedule add, list, run and remove', async () => {
    const added = await run(['schedule', 'add', site.origin, '--cron', '0 3 * * *', '--id', 'cli', '-d', 'desktop', '--per-template', '1', '--json'])
    expect(added.code).toBe(0)
    expect(JSON.parse(added.stdout)).toMatchObject({ id: 'cli', devices: ['desktop'], overrides: { sampling: { perTemplate: 1 } } })
    expect((await run(['schedule', 'add', site.origin, '--cron', '*/5 * * * *'])).code).toBe(2)
    expect((await run(['schedule', 'add', site.origin])).stderr).toContain('--cron')

    const listed = await run(['schedule', 'list'])
    expect(listed.stdout).toContain(`cli  ${site.origin}  "0 3 * * *"  enabled  api`)

    const ran = await run(['schedule', 'run', 'cli'])
    expect(ran.code).toBe(0)
    expect(ran.stdout).toContain(`Unlighthouse · ${site.origin}`)

    expect((await run(['schedule', 'remove', 'cli'])).stdout).toContain('Removed schedule cli')
    expect((await run(['schedule', 'remove', 'cli'])).code).toBe(2)
    expect((await run(['schedule', 'explode'])).code).toBe(2)
  })

  test('notify test and notifications after unlighthouse scan come from the config file', async () => {
    writeFileSync(join(dir, 'unlighthouse.config.ts'), `export default { notifications: [{ id: 'team', type: 'webhook', url: 'env:HOOK', secret: 'env:HOOK_SECRET', on: ['scan-done'] }] }\n`)
    const listed = await run(['notify', 'list'])
    expect(listed.stdout).toContain('team  webhook  env:HOOK  on scan-done  all sites  config')
    const tested = await run(['notify', 'test', 'team'])
    expect(tested).toMatchObject({ code: 0, stdout: 'Sent a test message to team (HTTP 200)\n' })
    expect(verifySignature('s3cret-value', received[0]!.body, received[0]!.headers.get(SIGNATURE_HEADER))).toBe(true)
    expect((await run(['notify', 'test', 'nope'])).code).toBe(2)

    received.length = 0
    expect((await run(['scan', site.origin])).code).toBe(0)
    expect(received).toHaveLength(1)
    expect(JSON.parse(received[0]!.body).events).toEqual(['scan-done'])
    const scans = await run(['scan', site.origin, '--json'])
    expect(JSON.stringify(JSON.parse(scans.stdout).scan.options)).not.toContain('notifications')
  })
})
