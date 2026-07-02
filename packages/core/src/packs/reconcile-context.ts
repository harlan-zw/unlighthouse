import type { PackReconcileCtx } from '@unlighthouse/contracts/packs'
import type { BlobStore } from '@unlighthouse/contracts/ports'
import type { Device, ScanId, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { gunzipSync } from 'fflate'
import { loadRouteContract } from '../report/route-contracts'

export interface CreatePackReconcileCtxOptions {
  scanId: ScanId
  routes: ScanRoute[]
  blobs: BlobStore
  logger?: PackReconcileCtx['logger']
}

function routeCacheKey(url: string, device: ScanRoute['device']): string {
  return `${url}|${device}`
}

export function createPackReconcileCtx(opts: CreatePackReconcileCtxOptions): PackReconcileCtx {
  const routesByKey = new Map<string, ScanRoute>()
  for (const route of opts.routes) {
    const key = routeCacheKey(route.url, route.device)
    if (!routesByKey.has(key))
      routesByKey.set(key, route)
  }

  const lhrCache = new Map<string, unknown | null>()
  const reconciledCache = new Map<string, Awaited<ReturnType<NonNullable<PackReconcileCtx['getReconciled']>>>>()

  return {
    scanId: opts.scanId,
    routes: opts.routes,
    async getLhr(url, device) {
      const key = routeCacheKey(url, device)
      if (lhrCache.has(key))
        return lhrCache.get(key) ?? null

      const route = routesByKey.get(key)
      if (!route?.lhrBlobKey) {
        lhrCache.set(key, null)
        return null
      }

      const gz = await opts.blobs.get(route.lhrBlobKey)
      if (!gz) {
        lhrCache.set(key, null)
        return null
      }

      const lhr = JSON.parse(new TextDecoder().decode(gunzipSync(gz)))
      lhrCache.set(key, lhr)
      return lhr
    },
    async getReconciled(url, device) {
      const key = routeCacheKey(url, device)
      if (reconciledCache.has(key))
        return reconciledCache.get(key) ?? null

      const route = routesByKey.get(key)
      const contract = route ? await loadRouteContract(opts.blobs, route) : null
      reconciledCache.set(key, contract)
      return contract
    },
    logger: opts.logger,
  }
}

export interface ResolvedPackRoute {
  url: string
  device: Device
}

// `ctx.routes` carries one row per (url, device) — a `--device
// mobile,desktop` scan produces a mobile row AND a desktop row per URL. Pack
// reports are site-wide summaries over distinct URLs, not per-device rows,
// so every reconciler needs to fold multi-device rows down to one row per
// URL before it fetches/accumulates anything. Looping `ctx.routes` directly
// and reading a hardcoded device double-counts routes and mis-reads (or
// drops) URLs that don't have that device.
//
// Device selection: prefer 'mobile' when the URL has a mobile row (mobile is
// the default emulation and matches historical single-device behaviour, so
// mobile-only scans see no change), otherwise fall back to whichever device
// the URL actually has data for (so desktop-only URLs get read correctly
// instead of dropped or misread against a mobile-only fetch).
export function resolveDistinctPackRoutes(routes: ScanRoute[]): ResolvedPackRoute[] {
  return resolveDistinctPackRows(routes).map(({ url, device }) => ({ url, device }))
}

// Same fold as `resolveDistinctPackRoutes`, but returns the picked `ScanRoute`
// itself (mobile-preferred) so a reconciler that reads the row's metric columns
// (e.g. the CWV p75 distribution) computes over one row per URL instead of
// doubling every metric across the mobile+desktop rows.
export function resolveDistinctPackRows(routes: ScanRoute[]): ScanRoute[] {
  const rowsByUrl = new Map<string, Map<Device, ScanRoute>>()
  const urlOrder: string[] = []
  for (const route of routes) {
    let byDevice = rowsByUrl.get(route.url)
    if (!byDevice) {
      byDevice = new Map()
      rowsByUrl.set(route.url, byDevice)
      urlOrder.push(route.url)
    }
    byDevice.set(route.device, route)
  }
  return urlOrder.map((url) => {
    const byDevice = rowsByUrl.get(url)!
    return byDevice.get('mobile') ?? [...byDevice.values()][0]!
  })
}
