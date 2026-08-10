import type { Device } from '@unlighthouse/contracts'
import { SORT_OPTIONS } from './presentation'

export type CompareStatusFilter = 'all' | 'changed' | 'regressed' | 'improved' | 'added' | 'removed'
export type CompareDeviceFilter = '' | Device

export interface CompareQueryState {
  status: CompareStatusFilter
  device: CompareDeviceFilter
  q: string
  page: number
  sort: string
}

export type ComparePairIds = readonly [baseScanId: string | undefined, currentScanId: string | undefined]

export interface CompareScanLike {
  site: string
  device: Device
  summary?: { devices?: Device[] } | null
}

export type ComparePairCompatibility
  = | { _tag: 'missing-current' }
    | { _tag: 'missing-base' }
    | { _tag: 'loading-metadata' }
    | { _tag: 'same-scan' }
    | { _tag: 'different-site' }
    | { _tag: 'no-shared-device', baseDevices: Device[], currentDevices: Device[] }
    | { _tag: 'ready', sharedDevices: Device[], baseOnlyDevices: Device[], currentOnlyDevices: Device[] }

const COMPARE_STATUS_FILTERS = new Set<CompareStatusFilter>(['all', 'changed', 'regressed', 'improved', 'added', 'removed'])
const COMPARE_SORTS = new Set(SORT_OPTIONS.map(option => option.value))
const DEVICE_ORDER: Device[] = ['mobile', 'desktop']

function queryString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function orderedDevices(scan: CompareScanLike): Device[] {
  const devices = scan.summary?.devices?.length ? scan.summary.devices : [scan.device]
  const unique = new Set(devices)
  return DEVICE_ORDER.filter(device => unique.has(device))
}

function scanOrigin(site: string): string {
  return URL.canParse(site) ? new URL(site).origin : site
}

export function parseCompareQueryState(query: Record<string, unknown>): CompareQueryState {
  const statusCandidate = queryString(query.status) as CompareStatusFilter
  const status = COMPARE_STATUS_FILTERS.has(statusCandidate) ? statusCandidate : 'all'
  const deviceCandidate = queryString(query.device)
  const device = deviceCandidate === 'mobile' || deviceCandidate === 'desktop' ? deviceCandidate : ''
  const parsedPage = Number.parseInt(queryString(query.page), 10)
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1
  const sortCandidate = queryString(query.sort)
  const sort = COMPARE_SORTS.has(sortCandidate) ? sortCandidate : 'delta-perf-desc'

  return { status, device, q: queryString(query.q), page, sort }
}

export function didComparePairChange(previous: ComparePairIds | undefined, current: ComparePairIds): boolean {
  return previous !== undefined && (previous[0] !== current[0] || previous[1] !== current[1])
}

export function comparePairCompatibility(input: {
  baseScanId?: string
  currentScanId?: string
  base?: CompareScanLike | null
  current?: CompareScanLike | null
}): ComparePairCompatibility {
  if (!input.currentScanId)
    return { _tag: 'missing-current' }
  if (!input.baseScanId)
    return { _tag: 'missing-base' }
  if (input.baseScanId === input.currentScanId)
    return { _tag: 'same-scan' }
  if (!input.base || !input.current)
    return { _tag: 'loading-metadata' }

  const baseOrigin = scanOrigin(input.base.site)
  const currentOrigin = scanOrigin(input.current.site)
  if (baseOrigin !== currentOrigin)
    return { _tag: 'different-site' }

  const baseDevices = orderedDevices(input.base)
  const currentDevices = orderedDevices(input.current)
  const sharedDevices = baseDevices.filter(device => currentDevices.includes(device))
  if (!sharedDevices.length)
    return { _tag: 'no-shared-device', baseDevices, currentDevices }

  return {
    _tag: 'ready',
    sharedDevices,
    baseOnlyDevices: baseDevices.filter(device => !sharedDevices.includes(device)),
    currentOnlyDevices: currentDevices.filter(device => !sharedDevices.includes(device)),
  }
}

export function comparisonRouteSetNotice(summary: { addedRoutes: number, removedRoutes: number }): string | null {
  if (!summary.addedRoutes && !summary.removedRoutes)
    return null
  const added = `${summary.addedRoutes} added`
  const removed = `${summary.removedRoutes} removed`
  return `Route set changed: ${added}, ${removed}. Summary deltas use each scan's full route and device population; filter route evidence to a shared device for like-for-like review.`
}
