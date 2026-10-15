import type { Device, Finding, Page, Scan, Scores, Site } from '../types.ts'

export interface SiteListItem extends Site {
  scans: number
  lastScan: Scan | null
  lastScores: Partial<Record<Device, Scores>>
}

export interface PageDetail extends Page {
  findings: Finding[]
}
