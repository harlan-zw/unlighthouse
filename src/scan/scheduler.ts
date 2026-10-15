import type { z } from 'zod'
import type { scheduleConfigSchema } from '../config.ts'
import type { Store } from '../contracts.ts'
import { UnlighthouseError } from '../errors.ts'
import type { EventBus } from '../events.ts'
import type { Scan, Schedule } from '../types.ts'
import { nextRun } from './cron.ts'
import type { Scanner, ScanInput } from './runner.ts'
import { isFinished } from './runner.ts'

export type ScheduleConfig = z.input<typeof scheduleConfigSchema>

export interface SchedulerOptions {
  store: Store
  scanner: Scanner
  bus: EventBus
  now?: () => number
  pollMs?: number
}

export interface Scheduler {
  start(): string[]
  tick(): string[]
  wake(): void
  stop(): void
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function scheduleInput(schedule: Schedule): ScanInput {
  const overrides = schedule.overrides as ScanInput
  return {
    ...overrides,
    site: schedule.site,
    ...(schedule.devices ? { devices: schedule.devices } : {}),
    label: overrides.label ?? `schedule ${schedule.id}`,
  }
}

export function runSchedule(store: Store, scanner: Scanner, schedule: Schedule, now: number): Scan {
  const previous = schedule.lastScanId ? store.getScan(schedule.lastScanId) : null
  if (previous && !isFinished(previous))
    throw new UnlighthouseError('SCAN_ACTIVE', `The previous scan of schedule ${schedule.id} (${previous.id}) is still ${previous.status}`)
  try {
    const scan = scanner.start(scheduleInput(schedule))
    store.patchSchedule(schedule.id, { lastRunAt: now, lastScanId: scan.id, lastError: null })
    return scan
  }
  catch (error) {
    store.patchSchedule(schedule.id, { lastRunAt: now, lastError: message(error) })
    throw error
  }
}

export function scheduleId(site: string, cron: string): string {
  const host = new URL(site).hostname.replace(/[^\w.-]/g, '-')
  return `${host}-${Bun.hash(`${site} ${cron}`).toString(16).slice(0, 8)}`
}

export function syncSchedules(store: Store, entries: ScheduleConfig[], parseOverrides: (raw: unknown) => Record<string, unknown>, now = Date.now()): { added: string[], updated: string[], removed: string[] } {
  const result = { added: [] as string[], updated: [] as string[], removed: [] as string[] }
  const seen = new Set<string>()
  const planned: Schedule[] = []
  for (const entry of entries) {
    const id = entry.id ?? scheduleId(entry.site, entry.cron)
    if (seen.has(id))
      throw new UnlighthouseError('INVALID_CONFIG', `Two schedules in the config share the id ${id}; give them distinct ids`)
    seen.add(id)
    const existing = store.getSchedule(id)
    if (existing && existing.source !== 'config')
      throw new UnlighthouseError('INVALID_CONFIG', `The config schedule ${id} has the id of a schedule created through the API; rename one of them`)
    const enabled = entry.enabled ?? true
    const cron = entry.cron.trim()
    const keepNext = existing && existing.cron === cron && existing.enabled === enabled
    planned.push({
      id,
      site: entry.site,
      cron,
      devices: entry.devices ?? null,
      overrides: parseOverrides(entry.overrides ?? {}),
      enabled,
      source: 'config',
      lastRunAt: existing?.lastRunAt ?? null,
      nextRunAt: keepNext ? existing.nextRunAt : enabled ? nextRun(cron, now) : null,
      lastScanId: existing?.lastScanId ?? null,
      lastError: existing?.lastError ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    const bucket = existing ? result.updated : result.added
    bucket.push(id)
  }
  for (const schedule of planned)
    store.saveSchedule(schedule)
  for (const schedule of store.listSchedules()) {
    if (schedule.source === 'config' && !seen.has(schedule.id)) {
      store.deleteSchedule(schedule.id)
      result.removed.push(schedule.id)
    }
  }
  return result
}

export function createScheduler(options: SchedulerOptions): Scheduler {
  const { store, scanner, bus } = options
  const now = options.now ?? Date.now
  const pollMs = options.pollMs ?? 60_000
  let timer: ReturnType<typeof setTimeout> | null = null
  let running = false

  function log(level: 'info' | 'warn' | 'error', text: string, scanId?: string): void {
    bus.emit({ type: 'log', level, message: text, ...(scanId ? { scanId } : {}) })
  }

  function arm(): void {
    if (timer)
      clearTimeout(timer)
    timer = null
    if (!running)
      return
    const due = store.listSchedules().filter(schedule => schedule.enabled && schedule.nextRunAt !== null).map(schedule => schedule.nextRunAt!)
    const delay = Math.max(0, Math.min(pollMs, (due.length ? Math.min(...due) : Infinity) - now()))
    timer = setTimeout(() => {
      timer = null
      tick()
    }, delay)
  }

  function tick(): string[] {
    const started: string[] = []
    const at = now()
    for (const schedule of store.listSchedules()) {
      if (!schedule.enabled || (schedule.nextRunAt !== null && schedule.nextRunAt > at))
        continue
      let next: number | null
      try {
        next = nextRun(schedule.cron, at)
      }
      catch (error) {
        store.patchSchedule(schedule.id, { nextRunAt: null, lastError: message(error) })
        log('error', `Schedule ${schedule.id} has an invalid cron expression: ${message(error)}`)
        continue
      }
      store.patchSchedule(schedule.id, { nextRunAt: next })
      if (schedule.nextRunAt === null)
        continue
      try {
        const scan = runSchedule(store, scanner, schedule, at)
        started.push(scan.id)
        log('info', `Schedule ${schedule.id} started scan ${scan.id}`, scan.id)
      }
      catch (error) {
        if (error instanceof UnlighthouseError && error.code === 'SCAN_ACTIVE') {
          store.patchSchedule(schedule.id, { lastError: `Skipped a run: ${error.message}` })
          log('warn', `Schedule ${schedule.id} skipped a run: ${error.message}`)
        }
        else {
          log('error', `Schedule ${schedule.id} could not start a scan: ${message(error)}`)
        }
      }
    }
    arm()
    return started
  }

  return {
    start() {
      running = true
      return tick()
    },
    tick,
    wake: arm,
    stop() {
      running = false
      arm()
    },
  }
}
