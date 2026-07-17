import type { Device } from '@unlighthouse/contracts/types/atoms'
import { sha1Hex } from '../util/sha1'

export interface RouteArtifactKeys {
  lhr: string
  report: string
  contract: string
  screenshot: string
}

/** Single deterministic key layout shared by ingest and row adapters. */
export function routeArtifactKeys(scanId: string, url: string, device: Device): RouteArtifactKeys {
  const hash = sha1Hex(url).slice(0, 16)
  const stem = `${hash}-${device}`
  return {
    lhr: `scans/${scanId}/lhr/${stem}.json.gz`,
    report: `scans/${scanId}/reports/${stem}.json`,
    contract: `scans/${scanId}/reports/${stem}.contract.json`,
    screenshot: `scans/${scanId}/screenshots/${stem}.webp`,
  }
}
