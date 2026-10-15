import { z } from 'zod'
import { configSchema, cronSchema, monitorId, secretRef } from '../config.ts'
import { UnlighthouseError } from '../errors.ts'
import { nextRun } from '../scan/cron.ts'
import type { Notifier } from '../scan/notify.ts'
import { createNotifier, publicChannel } from '../scan/notify.ts'
import { runSchedule, scheduleId } from '../scan/scheduler.ts'
import { DEVICES, NOTIFICATION_EVENTS, NOTIFICATION_TYPES } from '../types.ts'
import type { NotificationChannel, Schedule } from '../types.ts'
import { publicScan } from './analysis.ts'
import type { AnyOperation, OperationContext } from './registry.ts'
import { defineOperation } from './registry.ts'

type ScanInputSchema = z.ZodObject<z.ZodRawShape>

const device = z.enum(DEVICES)
const site = z.url({ protocol: /^https?$/ })
const events = z.array(z.enum(NOTIFICATION_EVENTS)).min(1)
  .describe('Events to send: scan-done, scan-failed, regression (pages got worse than the baseline), budget-failed, new-issues (issues absent from the baseline)')
const sites = z.array(site).min(1).describe('Only notify for scans of these sites (origins); every site when left out')
const scheduleIdInput = z.string().min(1).describe('Schedule id, from schedules.list')
const notificationIdInput = z.string().min(1).describe('Notification id, from notifications.list')

export function scheduleOverridesSchema(scanInput: ScanInputSchema) {
  return scanInput.omit({ site: true, devices: true, branch: true, commit: true })
}

function originOf(url: string): string {
  return new URL(url).origin
}

function getSchedule(ctx: OperationContext, id: string): Schedule {
  const schedule = ctx.store.getSchedule(id)
  if (!schedule)
    throw new UnlighthouseError('NOT_FOUND', `Schedule not found: ${id}. Call schedules.list for ids.`)
  return schedule
}

function editable(schedule: Schedule | NotificationChannel, kind: string): void {
  if (schedule.source === 'config')
    throw new UnlighthouseError('INVALID_INPUT', `The ${kind} ${schedule.id} is defined in the config file; change it there and restart unlighthouse serve`)
}

function notifierOf(ctx: OperationContext): Notifier {
  return ctx.notifier ?? createNotifier({ store: ctx.store, env: process.env })
}

function getChannel(ctx: OperationContext, id: string): NotificationChannel {
  const channel = notifierOf(ctx).channel(id)
  if (!channel)
    throw new UnlighthouseError('NOT_FOUND', `Notification not found: ${id}. Call notifications.list for ids.`)
  return channel
}

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T
}

export function configJsonSchema(scanInput: ScanInputSchema): Record<string, unknown> {
  const ignored = Object.keys(configSchema.shape).filter(key => !(key in scanInput.shape))
  const mask = Object.fromEntries(ignored.map(key => [key, true])) as Record<keyof typeof configSchema.shape, true>
  return z.toJSONSchema(configSchema.omit(mask), { io: 'input', unrepresentable: 'any' }) as Record<string, unknown>
}

export function monitoringOperations(scanInput: ScanInputSchema): AnyOperation[] {
  const overrides = scheduleOverridesSchema(scanInput)
    .describe('Scan options for every run, same keys as scans.start (except site, devices, branch, commit); label defaults to "schedule <id>"')

  return [
    defineOperation({
      name: 'schedules.list',
      kind: 'read',
      description: 'Lists scheduled scans that `unlighthouse serve` runs on a cron timetable: site, cron, devices, option overrides, enabled, source (config file or api), lastRunAt, nextRunAt (ms since epoch), lastScanId and lastError.',
      input: z.object({}),
      handler({ store }) {
        return store.listSchedules()
      },
    }),

    defineOperation({
      name: 'schedules.create',
      kind: 'write',
      description: 'Creates a scheduled scan of a site on a cron timetable (5 fields: minute hour day month weekday, server time zone, e.g. "0 3 * * *" for 03:00 daily; runs must be at least 15 minutes apart). Runs only while `unlighthouse serve` is running; a run missed while it was down happens once at the next start. Returns the schedule with nextRunAt.',
      input: z.object({
        id: monitorId.optional().describe('Optional id; derived from site and cron when left out'),
        site: site.describe('URL to scan, e.g. https://example.com'),
        cron: cronSchema,
        devices: z.array(device).min(1).optional().describe('Devices to audit; default from config (mobile)'),
        overrides: overrides.optional(),
        enabled: z.boolean().default(true),
      }),
      handler(ctx, input) {
        const now = Date.now()
        const id = input.id ?? scheduleId(input.site, input.cron)
        if (ctx.store.getSchedule(id))
          throw new UnlighthouseError('INVALID_INPUT', `A schedule with id ${id} already exists`)
        const schedule: Schedule = {
          id,
          site: input.site,
          cron: input.cron,
          devices: input.devices ?? null,
          overrides: withoutUndefined(input.overrides ?? {}),
          enabled: input.enabled,
          source: 'api',
          lastRunAt: null,
          nextRunAt: input.enabled ? nextRun(input.cron, now) : null,
          lastScanId: null,
          lastError: null,
          createdAt: now,
          updatedAt: now,
        }
        ctx.store.saveSchedule(schedule)
        ctx.scheduler?.wake()
        return schedule
      },
    }),

    defineOperation({
      name: 'schedules.update',
      kind: 'write',
      description: 'Changes a schedule created through the API: site, cron, devices (null = config default), overrides (replaced as a whole) or enabled. Changing cron or enabling it recomputes nextRunAt from now. Schedules from the config file are changed in the file instead.',
      input: z.object({
        id: scheduleIdInput,
        site: site.optional(),
        cron: cronSchema.optional(),
        devices: z.array(device).min(1).nullable().optional(),
        overrides: overrides.optional(),
        enabled: z.boolean().optional(),
      }),
      handler(ctx, input) {
        const current = getSchedule(ctx, input.id)
        editable(current, 'schedule')
        const now = Date.now()
        const cron = input.cron ?? current.cron
        const enabled = input.enabled ?? current.enabled
        const retime = cron !== current.cron || (enabled && !current.enabled)
        const schedule: Schedule = {
          ...current,
          site: input.site ?? current.site,
          cron,
          devices: input.devices === undefined ? current.devices : input.devices,
          overrides: input.overrides ? withoutUndefined(input.overrides) : current.overrides,
          enabled,
          nextRunAt: !enabled ? null : retime ? nextRun(cron, now) : current.nextRunAt,
          updatedAt: now,
        }
        ctx.store.saveSchedule(schedule)
        ctx.scheduler?.wake()
        return schedule
      },
    }),

    defineOperation({
      name: 'schedules.delete',
      kind: 'write',
      description: 'Deletes a schedule created through the API. Scans it already ran are kept. Returns { deleted: id }. Schedules from the config file are removed from the file instead.',
      input: z.object({ id: scheduleIdInput }),
      handler(ctx, input) {
        editable(getSchedule(ctx, input.id), 'schedule')
        ctx.store.deleteSchedule(input.id)
        ctx.scheduler?.wake()
        return { deleted: input.id }
      },
    }),

    defineOperation({
      name: 'schedules.runNow',
      kind: 'write',
      description: 'Queues a scan for a schedule right away with its site, devices and overrides, and returns { schedule, scan }. The timetable (nextRunAt) is unchanged. Fails with SCAN_ACTIVE while the previous scan of this schedule is still queued or running. Follow the scan with scans.wait.',
      input: z.object({ id: scheduleIdInput }),
      handler(ctx, input) {
        const scan = runSchedule(ctx.store, ctx.scanner, getSchedule(ctx, input.id), Date.now())
        return { schedule: getSchedule(ctx, input.id), scan: publicScan(scan) }
      },
    }),

    defineOperation({
      name: 'notifications.list',
      kind: 'read',
      description: 'Lists notification channels (generic webhook, Slack or Discord) with the events they send and the sites they cover. URLs and secrets are never returned: env:NAME references are shown as is, literal values as [redacted].',
      input: z.object({}),
      handler(ctx) {
        return notifierOf(ctx).channels().map(publicChannel)
      },
    }),

    defineOperation({
      name: 'notifications.create',
      kind: 'write',
      description: 'Adds a notification channel sent after scans. type is webhook (JSON body, signed with HMAC-SHA256 in the x-unlighthouse-signature-256 header when secret is set), slack or discord (incoming webhook URL). Give url and secret as env:NAME so the secret stays in the environment. Check it with notifications.test.',
      input: z.object({
        id: monitorId.optional().describe('Optional id; generated when left out'),
        type: z.enum(NOTIFICATION_TYPES),
        url: secretRef.describe('Webhook URL or env:NAME, e.g. env:SLACK_WEBHOOK'),
        secret: z.string().min(1).optional().describe('HMAC key for type webhook, preferably env:NAME'),
        on: events.default(['scan-failed', 'regression', 'budget-failed']),
        sites: sites.optional(),
      }),
      handler(ctx, input) {
        const id = input.id ?? `${input.type}-${crypto.randomUUID().slice(0, 8)}`
        if (notifierOf(ctx).channel(id))
          throw new UnlighthouseError('INVALID_INPUT', `A notification with id ${id} already exists`)
        const channel: NotificationChannel = {
          id,
          type: input.type,
          url: input.url,
          secret: input.secret ?? null,
          on: input.on,
          sites: input.sites ? input.sites.map(originOf) : null,
          source: 'api',
          createdAt: Date.now(),
        }
        ctx.store.saveNotification(channel)
        return publicChannel(channel)
      },
    }),

    defineOperation({
      name: 'notifications.update',
      kind: 'write',
      description: 'Changes a notification channel created through the API: type, url, secret (null removes it), on or sites (null = every site). Channels from the config file are changed in the file instead.',
      input: z.object({
        id: notificationIdInput,
        type: z.enum(NOTIFICATION_TYPES).optional(),
        url: secretRef.optional(),
        secret: z.string().min(1).nullable().optional(),
        on: events.optional(),
        sites: sites.nullable().optional(),
      }),
      handler(ctx, input) {
        const current = getChannel(ctx, input.id)
        editable(current, 'notification')
        const channel: NotificationChannel = {
          ...current,
          type: input.type ?? current.type,
          url: input.url ?? current.url,
          secret: input.secret === undefined ? current.secret : input.secret,
          on: input.on ?? current.on,
          sites: input.sites === undefined ? current.sites : input.sites === null ? null : input.sites.map(originOf),
        }
        ctx.store.saveNotification(channel)
        return publicChannel(channel)
      },
    }),

    defineOperation({
      name: 'notifications.delete',
      kind: 'write',
      description: 'Deletes a notification channel created through the API; its delivery log is kept. Returns { deleted: id }. Channels from the config file are removed from the file instead.',
      input: z.object({ id: notificationIdInput }),
      handler(ctx, input) {
        editable(getChannel(ctx, input.id), 'notification')
        ctx.store.deleteNotification(input.id)
        return { deleted: input.id }
      },
    }),

    defineOperation({
      name: 'notifications.test',
      kind: 'write',
      description: 'Sends a test message to one notification channel now and returns the delivery: status sent or failed, attempts, HTTP status and error. Use it after notifications.create to check the URL.',
      input: z.object({ id: notificationIdInput }),
      handler(ctx, input) {
        return notifierOf(ctx).test(input.id)
      },
    }),

    defineOperation({
      name: 'notifications.log',
      kind: 'read',
      description: 'Lists notification deliveries newest first as { items, total }: channel id, scan id, events sent, status (sent or failed), attempts, HTTP status and error. Filter by notificationId or scanId.',
      input: z.object({
        notificationId: z.string().optional(),
        scanId: z.string().optional(),
        limit: z.number().int().min(1).max(500).default(50).describe('Page size, at most 500'),
        offset: z.number().int().min(0).default(0).describe('Number of rows to skip'),
      }),
      handler({ store }, input) {
        return store.listDeliveries({
          limit: input.limit,
          offset: input.offset,
          ...(input.notificationId ? { notificationId: input.notificationId } : {}),
          ...(input.scanId ? { scanId: input.scanId } : {}),
        })
      },
    }),

    defineOperation({
      name: 'config.schema',
      kind: 'read',
      description: 'Returns the JSON Schema of the scan options that scans.start and schedule overrides accept (devices, categories, throttling, discovery, sampling, budgets, ...), with descriptions and defaults. Keys the API ignores (auth, chromePath, dataDir, schedules, notifications) are left out.',
      input: z.object({}),
      handler() {
        return configJsonSchema(scanInput)
      },
    }),
  ]
}
