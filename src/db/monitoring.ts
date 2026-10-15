import type { Database, SQLQueryBindings } from 'bun:sqlite'
import type { MonitorStore, NewDelivery, SchedulePatch } from '../contracts.ts'
import { UnlighthouseError } from '../errors.ts'
import type { Delivery, Device, NotificationChannel, NotificationEvent, NotificationType, Schedule } from '../types.ts'

type Row = Record<string, unknown>
type Value = Exclude<SQLQueryBindings, Record<string, unknown>>
type Bindings = Record<string, Value>

const KEEP_DELIVERIES = 2000

function toSchedule(row: Row): Schedule {
  return {
    id: row['id'] as string,
    site: row['site'] as string,
    cron: row['cron'] as string,
    devices: row['devices'] === null ? null : JSON.parse(row['devices'] as string) as Device[],
    overrides: JSON.parse(row['overrides'] as string) as Record<string, unknown>,
    enabled: row['enabled'] === 1,
    source: row['source'] as Schedule['source'],
    lastRunAt: row['last_run_at'] as number | null,
    nextRunAt: row['next_run_at'] as number | null,
    lastScanId: row['last_scan_id'] as string | null,
    lastError: row['last_error'] as string | null,
    createdAt: row['created_at'] as number,
    updatedAt: row['updated_at'] as number,
  }
}

function toChannel(row: Row): NotificationChannel {
  return {
    id: row['id'] as string,
    type: row['type'] as NotificationType,
    url: row['url'] as string,
    secret: row['secret'] as string | null,
    on: JSON.parse(row['events'] as string) as NotificationEvent[],
    sites: row['sites'] === null ? null : JSON.parse(row['sites'] as string) as string[],
    source: 'api',
    createdAt: row['created_at'] as number,
  }
}

function toDelivery(row: Row): Delivery {
  return {
    id: row['id'] as number,
    notificationId: row['notification_id'] as string,
    scanId: row['scan_id'] as string | null,
    events: JSON.parse(row['events'] as string) as NotificationEvent[],
    status: row['status'] as Delivery['status'],
    attempts: row['attempts'] as number,
    httpStatus: row['http_status'] as number | null,
    error: row['error'] as string | null,
    createdAt: row['created_at'] as number,
  }
}

export function monitorStore(db: Database): MonitorStore {
  const all = (sql: string, bindings: Bindings = {}) => db.query<Row, Bindings>(sql).all(bindings)
  const get = (sql: string, bindings: Bindings = {}) => db.query<Row, Bindings>(sql).get(bindings)
  const run = (sql: string, bindings: Bindings = {}) => db.query<Row, Bindings>(sql).run(bindings)

  return {
    listSchedules() {
      return all('SELECT * FROM schedules ORDER BY created_at, id').map(toSchedule)
    },

    getSchedule(id) {
      const row = get('SELECT * FROM schedules WHERE id = $id', { id })
      return row ? toSchedule(row) : null
    },

    saveSchedule(schedule) {
      run(`INSERT INTO schedules (id, site, cron, devices, overrides, enabled, source, last_run_at, next_run_at, last_scan_id, last_error, created_at, updated_at)
        VALUES ($id, $site, $cron, $devices, $overrides, $enabled, $source, $lastRunAt, $nextRunAt, $lastScanId, $lastError, $createdAt, $updatedAt)
        ON CONFLICT(id) DO UPDATE SET site = excluded.site, cron = excluded.cron, devices = excluded.devices, overrides = excluded.overrides,
          enabled = excluded.enabled, source = excluded.source, last_run_at = excluded.last_run_at, next_run_at = excluded.next_run_at,
          last_scan_id = excluded.last_scan_id, last_error = excluded.last_error, updated_at = excluded.updated_at`, {
        id: schedule.id,
        site: schedule.site,
        cron: schedule.cron,
        devices: schedule.devices ? JSON.stringify(schedule.devices) : null,
        overrides: JSON.stringify(schedule.overrides),
        enabled: schedule.enabled ? 1 : 0,
        source: schedule.source,
        lastRunAt: schedule.lastRunAt,
        nextRunAt: schedule.nextRunAt,
        lastScanId: schedule.lastScanId,
        lastError: schedule.lastError,
        createdAt: schedule.createdAt,
        updatedAt: schedule.updatedAt,
      })
    },

    patchSchedule(id, patch: SchedulePatch) {
      const columns: Array<[keyof SchedulePatch, string]> = [
        ['lastRunAt', 'last_run_at'],
        ['nextRunAt', 'next_run_at'],
        ['lastScanId', 'last_scan_id'],
        ['lastError', 'last_error'],
      ]
      const sets: string[] = []
      const bindings: Bindings = { id }
      for (const [key, column] of columns) {
        if (patch[key] === undefined)
          continue
        sets.push(`${column} = $${column}`)
        bindings[column] = patch[key]
      }
      if (sets.length && run(`UPDATE schedules SET ${sets.join(', ')} WHERE id = $id`, bindings).changes === 0)
        throw new UnlighthouseError('NOT_FOUND', `Schedule not found: ${id}`)
    },

    deleteSchedule(id) {
      return run('DELETE FROM schedules WHERE id = $id', { id }).changes > 0
    },

    listNotifications() {
      return all('SELECT * FROM notifications ORDER BY created_at, id').map(toChannel)
    },

    getNotification(id) {
      const row = get('SELECT * FROM notifications WHERE id = $id', { id })
      return row ? toChannel(row) : null
    },

    saveNotification(channel) {
      run(`INSERT INTO notifications (id, type, url, secret, events, sites, created_at)
        VALUES ($id, $type, $url, $secret, $events, $sites, $createdAt)
        ON CONFLICT(id) DO UPDATE SET type = excluded.type, url = excluded.url, secret = excluded.secret,
          events = excluded.events, sites = excluded.sites`, {
        id: channel.id,
        type: channel.type,
        url: channel.url,
        secret: channel.secret,
        events: JSON.stringify(channel.on),
        sites: channel.sites ? JSON.stringify(channel.sites) : null,
        createdAt: channel.createdAt,
      })
    },

    deleteNotification(id) {
      return run('DELETE FROM notifications WHERE id = $id', { id }).changes > 0
    },

    logDelivery(entry: NewDelivery) {
      const row = get(`INSERT INTO notification_deliveries (notification_id, scan_id, events, status, attempts, http_status, error, created_at)
        VALUES ($notificationId, $scanId, $events, $status, $attempts, $httpStatus, $error, $now) RETURNING *`, {
        notificationId: entry.notificationId,
        scanId: entry.scanId,
        events: JSON.stringify(entry.events),
        status: entry.status,
        attempts: entry.attempts,
        httpStatus: entry.httpStatus,
        error: entry.error,
        now: Date.now(),
      })!
      run(`DELETE FROM notification_deliveries WHERE id NOT IN
        (SELECT id FROM notification_deliveries ORDER BY created_at DESC, id DESC LIMIT ${KEEP_DELIVERIES})`)
      return toDelivery(row)
    },

    listDeliveries(query) {
      const where: string[] = []
      const bindings: Bindings = {}
      if (query.notificationId !== undefined) {
        where.push('notification_id = $notificationId')
        bindings['notificationId'] = query.notificationId
      }
      if (query.scanId !== undefined) {
        where.push('scan_id = $scanId')
        bindings['scanId'] = query.scanId
      }
      const clause = where.length ? ` WHERE ${where.join(' AND ')}` : ''
      const total = get(`SELECT count(*) AS total FROM notification_deliveries${clause}`, bindings)!['total'] as number
      const items = all(`SELECT * FROM notification_deliveries${clause} ORDER BY created_at DESC, id DESC LIMIT $limit OFFSET $offset`, { ...bindings, limit: query.limit, offset: query.offset })
      return { items: items.map(toDelivery), total }
    },
  }
}
