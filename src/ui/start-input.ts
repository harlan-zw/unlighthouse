import type { Scan } from '../types.ts'
import type { Input } from './api.ts'

const CARRIED = ['categories', 'throttling', 'concurrency', 'samples', 'timeoutMs', 'retries', 'urls', 'templates', 'userAgent', 'discover', 'sampling', 'budgets'] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function authEmpty(auth: unknown): boolean {
  if (!isRecord(auth))
    return false
  const maps = ['headers', 'localStorage', 'sessionStorage'].every(key => !isRecord(auth[key]) || Object.keys(auth[key]).length === 0)
  const cookies = !Array.isArray(auth['cookies']) || auth['cookies'].length === 0
  return maps && cookies && !auth['login']
}

export function startInputFrom(scan: Scan): Input<'scans.start'> {
  const input: Record<string, unknown> = { site: scan.origin, devices: scan.devices }
  const options = isRecord(scan.options) ? scan.options : {}
  for (const key of CARRIED) {
    const value = options[key]
    if (value !== undefined && value !== null)
      input[key] = value
  }
  const lighthouse = options['lighthouse']
  if (isRecord(lighthouse)) {
    const filters: Record<string, unknown> = {}
    for (const key of ['skipAudits', 'onlyAudits']) {
      const value = lighthouse[key]
      if (Array.isArray(value) && value.length > 0)
        filters[key] = value
    }
    if (Object.keys(filters).length > 0)
      input['lighthouse'] = filters
  }
  if (authEmpty(options['auth']))
    input['auth'] = false
  if (scan.label)
    input['label'] = scan.label
  if (scan.branch)
    input['branch'] = scan.branch
  if (scan.commit)
    input['commit'] = scan.commit
  return input as Input<'scans.start'>
}
