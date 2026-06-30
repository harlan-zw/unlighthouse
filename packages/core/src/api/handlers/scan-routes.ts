import type { Storage } from '@unlighthouse/contracts/ports'
import type { ScanId, ScanRoute } from '@unlighthouse/contracts/types/atoms'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'

const FULL_SCAN_ROUTE_PAGE_SIZE = 10_000

export async function loadScanRoutes(storage: Storage, scanId: ScanId): Promise<ScanRoute[]> {
  const scan = await storage.scans.get(scanId)
  if (!scan)
    throw new UnlighthouseError({ code: 'SCAN_NOT_FOUND', message: `scanId=${scanId}` })

  const result = await storage.routes.listForScan(scanId, { page: 1, pageSize: FULL_SCAN_ROUTE_PAGE_SIZE })
  return result.items
}
