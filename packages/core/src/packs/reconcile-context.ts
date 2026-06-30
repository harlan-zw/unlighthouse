import type { PackReconcileCtx } from '@unlighthouse/contracts/packs'
import type { BlobStore } from '@unlighthouse/contracts/ports'
import type { ScanId, ScanRoute } from '@unlighthouse/contracts/types/atoms'
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
  const reconciledCache = new Map<string, unknown | null>()

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
