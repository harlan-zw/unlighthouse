import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import type { notificationConfigSchema } from '../config.ts'
import { ENV_REF } from '../config.ts'
import type { Store } from '../contracts.ts'
import { UnlighthouseError } from '../errors.ts'
import type { EventBus } from '../events.ts'
import { analyzeScan, budgetReport, scanBudgets } from '../ops/analysis.ts'
import { CATEGORIES } from '../types.ts'
import type { Category, Delivery, Device, NotificationChannel, NotificationEvent, Scan } from '../types.ts'

export interface NotificationMessage {
  title: string
  text: string
  test: boolean
  events: NotificationEvent[]
  site: string
  link: string | null
  scan: Pick<Scan, 'id' | 'status' | 'label' | 'branch' | 'commit' | 'error' | 'finishedAt'> | null
  baseline: string | null
  devices: Array<{ device: Device, scores: Partial<Record<Category, number>>, deltas: Partial<Record<Category, number>> }>
  regressions: Array<{ path: string, device: Device, deltas: Partial<Record<Category, number>> }>
  newIssues: Array<{ title: string, itemLabel: string | null, pages: number }>
  failedBudgets: Array<{ rule: string, scope: string, actual: number | null, limit: number }>
}

export interface DeliveryOptions {
  env: Record<string, string | undefined>
  fetch?: typeof fetch
  attempts?: number
  backoffMs?: number
  timeoutMs?: number
  signal?: AbortSignal
}

export interface DeliveryOutcome {
  status: Delivery['status']
  attempts: number
  httpStatus: number | null
  error: string | null
}

export interface NotifierOptions extends DeliveryOptions {
  store: Store
  bus?: EventBus
  channels?: Array<z.input<typeof notificationConfigSchema>>
  publicUrl?: string
}

export interface Notifier {
  channels(): NotificationChannel[]
  channel(id: string): NotificationChannel | null
  notifyScan(scanId: string): Promise<Delivery[]>
  test(id: string): Promise<Delivery>
  idle(): Promise<void>
  close(): Promise<void>
}

export const SIGNATURE_HEADER = 'x-unlighthouse-signature-256'

const SHORT: Record<Category, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'best-practices': 'Best practices',
  'seo': 'SEO',
  'agentic-browsing': 'Agentic',
}

const TOP = 3
const REDACTED = '[redacted]'

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function host(site: string): string {
  try {
    return new URL(site).host
  }
  catch {
    return site
  }
}

function points(value: number): string {
  return String(Math.round(value * 100))
}

function signedPoints(delta: number): string {
  const value = Math.round(delta * 100)
  return value > 0 ? `+${value}` : String(value)
}

export function redactUrl(url: string): string {
  if (ENV_REF.test(url))
    return url
  try {
    return `${new URL(url).origin}/${REDACTED}`
  }
  catch {
    return REDACTED
  }
}

export function publicChannel(channel: NotificationChannel): NotificationChannel {
  return {
    ...channel,
    url: redactUrl(channel.url),
    secret: channel.secret === null ? null : ENV_REF.test(channel.secret) ? channel.secret : REDACTED,
  }
}

export function sign(secret: string, body: string): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

export function verifySignature(secret: string, body: string, header: string | null): boolean {
  if (!header)
    return false
  const expected = Buffer.from(sign(secret, body))
  const given = Buffer.from(header)
  return expected.length === given.length && timingSafeEqual(expected, given)
}

function eventTitle(events: NotificationEvent[], site: string, test: boolean): string {
  if (test)
    return `Unlighthouse test notification${site ? ` for ${host(site)}` : ''}`
  const parts: string[] = []
  if (events.includes('scan-failed'))
    parts.push('scan failed')
  if (events.includes('regression'))
    parts.push('regressed')
  if (events.includes('budget-failed'))
    parts.push('budgets failed')
  if (events.includes('new-issues'))
    parts.push('new issues')
  if (!parts.length)
    parts.push('scan done')
  return `Unlighthouse: ${host(site)} ${parts.join(', ')}`
}

function renderText(input: Omit<NotificationMessage, 'title' | 'text'>): string {
  const lines: string[] = []
  if (input.test)
    lines.push('This is a test message. Notifications for this channel are set up correctly.')
  if (input.scan?.status === 'failed')
    lines.push(`Scan ${input.scan.id} failed: ${input.scan.error ?? 'unknown error'}`)
  for (const entry of input.devices) {
    const scores = CATEGORIES.filter(category => entry.scores[category] !== undefined).map((category) => {
      const delta = entry.deltas[category]
      return `${SHORT[category]} ${points(entry.scores[category]!)}${delta ? ` (${signedPoints(delta)})` : ''}`
    })
    lines.push(`${entry.device}: ${scores.join(' · ')}`)
  }
  if (input.regressions.length) {
    lines.push('Top regressions:')
    for (const regression of input.regressions) {
      const deltas = CATEGORIES.filter(category => regression.deltas[category] !== undefined)
        .map(category => `${SHORT[category]} ${signedPoints(regression.deltas[category]!)}`)
      lines.push(`- ${regression.path} (${regression.device}) ${deltas.join(', ')}`)
    }
  }
  if (input.failedBudgets.length) {
    lines.push('Failed budgets:')
    for (const budget of input.failedBudgets)
      lines.push(`- ${budget.rule} [${budget.scope}]: ${budget.actual ?? '–'} (limit ${budget.limit})`)
  }
  if (input.newIssues.length) {
    lines.push('New issues:')
    for (const issue of input.newIssues)
      lines.push(`- ${issue.title}${issue.itemLabel ? ` — ${issue.itemLabel}` : ''} (${issue.pages} page(s))`)
  }
  if (input.link)
    lines.push(input.link)
  return lines.join('\n')
}

function finish(input: Omit<NotificationMessage, 'title' | 'text'>): NotificationMessage {
  return { title: eventTitle(input.events, input.site, input.test), text: renderText(input), ...input }
}

function dashboardLink(publicUrl: string | undefined, scanId: string): string | null {
  return publicUrl ? `${publicUrl.replace(/\/+$/, '')}/scans/${encodeURIComponent(scanId)}` : null
}

export function scanMessage(store: Store, scanId: string, publicUrl?: string): NotificationMessage | null {
  const scan = store.getScan(scanId)
  if (!scan || (scan.status !== 'done' && scan.status !== 'failed'))
    return null
  const base = {
    test: false,
    site: scan.origin,
    link: dashboardLink(publicUrl, scan.id),
    scan: { id: scan.id, status: scan.status, label: scan.label, branch: scan.branch, commit: scan.commit, error: scan.error, finishedAt: scan.finishedAt },
  }
  if (scan.status === 'failed')
    return finish({ ...base, events: ['scan-failed'], baseline: null, devices: [], regressions: [], newIssues: [], failedBudgets: [] })
  const analysis = analyzeScan(store, scan.id)
  const budgets = budgetReport(analysis, scanBudgets(scan))
  const comparison = analysis.comparison
  const events: NotificationEvent[] = ['scan-done']
  if (comparison && comparison.totals.pages.regressed + comparison.totals.pages.failed > 0)
    events.push('regression')
  if (!budgets.passed)
    events.push('budget-failed')
  if (comparison && comparison.totals.issues.new > 0)
    events.push('new-issues')
  const baseline = analysis.summary.baseline
  return finish({
    ...base,
    events,
    baseline: analysis.baseline?.id ?? null,
    devices: analysis.summary.devices.map(device => ({
      device: device.device,
      scores: device.scores.mean,
      deltas: baseline?.scores[device.device] ?? {},
    })),
    regressions: (baseline?.topRegressions ?? []).slice(0, TOP).map(entry => ({ path: entry.path, device: entry.device, deltas: entry.scores })),
    newIssues: (comparison?.issues.new ?? []).slice().sort((a, b) => b.impact - a.impact).slice(0, TOP)
      .map(issue => ({ title: issue.title, itemLabel: issue.itemLabel, pages: issue.headPages })),
    failedBudgets: budgets.results.filter(result => !result.passed)
      .map(result => ({ rule: result.rule, scope: result.scope, actual: result.actual, limit: result.limit })),
  })
}

export function testMessage(site: string, publicUrl?: string): NotificationMessage {
  return finish({
    test: true,
    events: [],
    site,
    link: publicUrl ?? null,
    scan: null,
    baseline: null,
    devices: [],
    regressions: [],
    newIssues: [],
    failedBudgets: [],
  })
}

function slackEscape(text: string): string {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

function clipText(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`
}

function isAlert(events: NotificationEvent[]): boolean {
  return events.some(event => event !== 'scan-done')
}

export function formatPayload(type: NotificationChannel['type'], message: NotificationMessage): Record<string, unknown> {
  if (type === 'slack') {
    const body = message.link && message.text.endsWith(message.link) ? message.text.slice(0, -message.link.length).trimEnd() : message.text
    return {
      text: message.title,
      blocks: [
        { type: 'header', text: { type: 'plain_text', text: clipText(message.title, 150) } },
        ...(body ? [{ type: 'section', text: { type: 'mrkdwn', text: clipText(slackEscape(body), 3000) } }] : []),
        ...(message.link ? [{ type: 'section', text: { type: 'mrkdwn', text: `<${message.link}|Open in Unlighthouse>` } }] : []),
      ],
    }
  }
  if (type === 'discord') {
    return {
      username: 'Unlighthouse',
      allowed_mentions: { parse: [] },
      embeds: [{
        title: clipText(message.title, 256),
        description: clipText(message.text, 4096),
        color: message.test ? 0x3B82F6 : isAlert(message.events) ? 0xDC2626 : 0x16A34A,
        timestamp: new Date(message.scan?.finishedAt ?? Date.now()).toISOString(),
        ...(message.link ? { url: message.link } : {}),
      }],
    }
  }
  return { type: 'unlighthouse.notification', sentAt: new Date().toISOString(), ...message }
}

function resolveSecret(value: string, env: DeliveryOptions['env']): string {
  const match = ENV_REF.exec(value)
  if (!match)
    return value
  const resolved = env[match[1]!]
  if (!resolved)
    throw new UnlighthouseError('INVALID_CONFIG', `The environment variable ${match[1]} is not set`)
  return resolved
}

function redactIn(text: string, secrets: string[]): string {
  let out = text
  for (const secret of secrets) {
    if (secret)
      out = out.replaceAll(secret, REDACTED)
  }
  return out
}

function retryable(status: number): boolean {
  return status === 408 || status === 429 || status >= 500
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done, { once: true })
  })
}

export async function deliver(channel: NotificationChannel, notification: NotificationMessage, options: DeliveryOptions): Promise<DeliveryOutcome> {
  const attempts = Math.max(1, options.attempts ?? 3)
  const backoffMs = options.backoffMs ?? 1000
  const timeoutMs = options.timeoutMs ?? 10_000
  const send = options.fetch ?? fetch
  let url: string
  let secret: string | null
  try {
    url = resolveSecret(channel.url, options.env)
    secret = channel.secret === null ? null : resolveSecret(channel.secret, options.env)
    if (!/^https?:$/.test(new URL(url).protocol))
      throw new UnlighthouseError('INVALID_CONFIG', 'The webhook URL must use http or https')
  }
  catch (error) {
    const text = error instanceof TypeError ? 'The webhook URL is not a valid URL' : message(error)
    return { status: 'failed', attempts: 0, httpStatus: null, error: text }
  }
  const secrets = [url, secret ?? '', new URL(url).pathname.length > 1 ? new URL(url).pathname : '']
  const body = JSON.stringify(formatPayload(channel.type, notification))
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    'user-agent': 'Unlighthouse',
  }
  if (channel.type === 'webhook') {
    headers['x-unlighthouse-event'] = notification.test ? 'test' : notification.events.join(',')
    if (secret)
      headers[SIGNATURE_HEADER] = sign(secret, body)
  }
  let httpStatus: number | null = null
  let lastError: string | null = null
  let attempt = 0
  while (attempt < attempts) {
    if (attempt > 0)
      await sleep(backoffMs * 2 ** (attempt - 1), options.signal)
    if (options.signal?.aborted) {
      lastError = 'Cancelled because Unlighthouse is stopping'
      break
    }
    attempt++
    const signals = [AbortSignal.timeout(timeoutMs), ...(options.signal ? [options.signal] : [])]
    try {
      const response = await send(url, { method: 'POST', headers, body, signal: AbortSignal.any(signals), redirect: 'error' })
      httpStatus = response.status
      await response.body?.cancel().catch(() => {})
      if (response.ok)
        return { status: 'sent', attempts: attempt, httpStatus, error: null }
      lastError = `HTTP ${response.status}`
      if (!retryable(response.status))
        break
    }
    catch (error) {
      httpStatus = null
      lastError = error instanceof DOMException && error.name === 'TimeoutError'
        ? `No response within ${timeoutMs} ms`
        : redactIn(message(error), secrets)
    }
  }
  return { status: 'failed', attempts: attempt, httpStatus, error: lastError }
}

function originOf(site: string): string {
  try {
    return new URL(site).origin
  }
  catch {
    return site
  }
}

export function configChannels(entries: NonNullable<NotifierOptions['channels']>): NotificationChannel[] {
  return entries.map(entry => ({
    id: entry.id,
    type: entry.type,
    url: entry.url,
    secret: entry.secret ?? null,
    on: entry.on ?? ['scan-failed', 'regression', 'budget-failed'],
    sites: entry.sites ? entry.sites.map(originOf) : null,
    source: 'config',
    createdAt: 0,
  }))
}

export function createNotifier(options: NotifierOptions): Notifier {
  const { store, bus } = options
  const fromConfig = configChannels(options.channels ?? [])
  let closed = false
  const inflight = new Set<Promise<unknown>>()

  function channels(): NotificationChannel[] {
    const ids = new Set(fromConfig.map(channel => channel.id))
    return [...fromConfig, ...store.listNotifications().filter(channel => !ids.has(channel.id))]
  }

  function channel(id: string): NotificationChannel | null {
    return channels().find(candidate => candidate.id === id) ?? null
  }

  function log(scanId: string | null, level: 'info' | 'warn', text: string): void {
    bus?.emit({ type: 'log', ...(scanId ? { scanId } : {}), level, message: text })
  }

  async function send(target: NotificationChannel, notification: NotificationMessage, scanId: string | null): Promise<Delivery> {
    const outcome = await deliver(target, notification, options)
    const events = notification.test ? [] : notification.events.filter(event => target.on.includes(event))
    const entry = store.logDelivery({ notificationId: target.id, scanId, events, ...outcome })
    if (outcome.status === 'sent')
      log(scanId, 'info', `Notification ${target.id} sent`)
    else
      log(scanId, 'warn', `Notification ${target.id} failed after ${outcome.attempts} attempt(s): ${outcome.error}`)
    return entry
  }

  function track<T>(promise: Promise<T>): Promise<T> {
    inflight.add(promise)
    promise.finally(() => inflight.delete(promise)).catch(() => {})
    return promise
  }

  async function notifyScan(scanId: string): Promise<Delivery[]> {
    let notification: NotificationMessage | null
    try {
      notification = scanMessage(store, scanId, options.publicUrl)
    }
    catch (error) {
      log(scanId, 'warn', `Notifications skipped: ${message(error)}`)
      return []
    }
    if (!notification)
      return []
    const current = notification
    const targets = channels().filter(target =>
      (!target.sites || target.sites.includes(current.site))
      && current.events.some(event => target.on.includes(event)))
    return Promise.all(targets.map(target => send(target, current, scanId)))
  }

  const off = bus?.on((event) => {
    if (event.type === 'scan:status' && (event.status === 'done' || event.status === 'failed') && !closed) {
      const scanId = event.scanId
      track(new Promise<void>(resolve => setTimeout(resolve, 0)).then(() => notifyScan(scanId))).catch(() => {})
    }
  })

  async function idle(): Promise<void> {
    while (inflight.size)
      await Promise.allSettled([...inflight])
  }

  return {
    channels,
    channel,
    notifyScan: scanId => track(notifyScan(scanId)),
    async test(id) {
      const target = channel(id)
      if (!target)
        throw new UnlighthouseError('NOT_FOUND', `Notification not found: ${id}. Call notifications.list for ids.`)
      return track(send(target, testMessage(target.sites?.[0] ?? '', options.publicUrl), null))
    },
    idle,
    async close() {
      closed = true
      off?.()
      await idle()
    },
  }
}
