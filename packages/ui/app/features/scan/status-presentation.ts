import type { ScanStatus } from '@unlighthouse/contracts'

export interface ScanOverviewStatusInput {
  metaStatus: ScanStatus | null | undefined
  hasSummary: boolean
  isCurrent: boolean
  storeStatus: ScanStatus | null | undefined
  remoteStatus: ScanStatus | null | undefined
}

export function resolveScanOverviewStatus(input: ScanOverviewStatusInput): ScanStatus | 'pending' {
  if (input.isCurrent && input.storeStatus)
    return input.storeStatus
  if (input.metaStatus)
    return input.metaStatus
  if (input.remoteStatus)
    return input.remoteStatus
  return input.hasSummary ? 'complete' : 'pending'
}
