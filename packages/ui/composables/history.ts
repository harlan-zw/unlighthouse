import { apiUrl } from './unlighthouse'

export interface HistoryScan {
  id: string
  site: string
  device: 'mobile' | 'desktop'
  throttle: boolean
  routeCount: number
  scannedCount: number
  failedCount: number
  avgScore: number | null
  performanceScore: number | null
  accessibilityScore: number | null
  bestPracticesScore: number | null
  seoScore: number | null
  status: 'running' | 'complete' | 'cancelled' | 'failed'
  startedAt: string
  completedAt: string | null
}

export function useScanHistory() {
  return useFetch<{ scans: HistoryScan[] }>(`${apiUrl.value}/history`, {
    key: 'scan-history',
    default: () => ({ scans: [] }),
  })
}

export function extractDomain(url: string) {
  try { return new URL(url).hostname }
  catch { return url }
}
