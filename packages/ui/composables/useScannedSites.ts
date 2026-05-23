// Derives the multi-site dashboard from `history.list({})`. The host may have
// scans for sites that aren't in the curated `sites.*` registry (e.g. when
// scans were started with an explicit `site` override via scan.start). This
// composable groups every persisted scan by its `site` URL and surfaces enough
// info to render a card per site without extra round-trips.
//
// Read-only — no new backend endpoints are introduced (#227 closes via UI
// composition over `history.list`).

import type { Scan } from '@unlighthouse/contracts'
import { siteHostname, useSites } from './sites'
import { useApiClient } from './useApiClient'

export interface ScannedSiteScores {
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
}

export interface ScannedSite {
  /** Canonical site URL as stored on the scan row. */
  url: string
  /** Hostname for display / URL-segment routing. */
  host: string
  /** Registered site (from sites.* registry), when one matches by URL. */
  registry: { id: string, name: string } | null
  /** Total scans recorded for this site URL. */
  scanCount: number
  /** Latest scan (by startedAt). */
  latest: Scan | null
  /** Latest *completed* scan; falls back to `latest` when none completed. */
  latestComplete: Scan | null
  /** scoreAverage across the most recent N completed scans, oldest → newest. */
  trend: number[]
  /** Score categories from `latestComplete.summary.scoresByCategory`, in 0..100. */
  scores: ScannedSiteScores
}

function pct(s: number | null | undefined) {
  return s == null ? null : Math.round(s * 100)
}

function urlKey(url: string) {
  try {
    const u = new URL(url)
    // Strip trailing slash to dedupe `https://x/` and `https://x` into one bucket.
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/$/, '')}`
  }
  catch {
    return url
  }
}

export function useScannedSites() {
  const client = useApiClient()
  const { sites } = useSites()

  const { data, pending, error, refresh } = useAsyncData(
    'scanned-sites',
    async () => {
      // 500 is the upper bound on history.list pageSize. For very busy hosts a
      // future change can iterate pages, but the dashboard's job is "show the
      // sites I scanned recently" so capping is fine for now.
      const res = await client['history.list']({ page: 1, pageSize: 500 })
      return res.items ?? []
    },
  )

  const scannedSites = computed<ScannedSite[]>(() => {
    const items = data.value ?? []
    if (!items.length)
      return []

    // Bucket by URL key.
    const buckets = new Map<string, Scan[]>()
    for (const scan of items) {
      const key = urlKey(scan.site)
      const arr = buckets.get(key) ?? []
      arr.push(scan)
      buckets.set(key, arr)
    }

    const out: ScannedSite[] = []
    for (const [, group] of buckets) {
      // Most-recent first.
      const sorted = [...group].sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      const latest = sorted[0] ?? null
      // A scan can be structurally `complete` but have zero audited routes
      // (e.g. local Chrome sandbox blocking puppeteer). Skip those when
      // sourcing the score cards so the dashboard doesn't render "No data"
      // for a site that actually has older scored scans.
      const latestComplete = sorted.find(
        s => s.status === 'complete' && s.summary?.scoreAverage != null,
      ) ?? sorted.find(s => s.status === 'complete') ?? latest
      // Trend: chronological (oldest→newest), last 10 completed scans with a score.
      const trend = [...sorted]
        .reverse()
        .filter(s => s.summary?.scoreAverage != null)
        .slice(-10)
        .map(s => Math.round((s.summary!.scoreAverage as number) * 100))

      const url = latest?.site ?? ''
      const match = sites.value.find(s => urlKey(s.url) === urlKey(url))
      const cat = latestComplete?.summary?.scoresByCategory

      out.push({
        url,
        host: siteHostname(url),
        registry: match ? { id: match.id, name: match.name } : null,
        scanCount: group.length,
        latest,
        latestComplete,
        trend,
        scores: {
          performance: pct(cat?.performance),
          accessibility: pct(cat?.accessibility),
          bestPractices: pct(cat?.['best-practices']),
          seo: pct(cat?.seo),
        },
      })
    }

    // Most-recently scanned site first.
    out.sort((a, b) => (b.latest?.startedAt ?? '').localeCompare(a.latest?.startedAt ?? ''))
    return out
  })

  return {
    scannedSites,
    pending,
    error,
    refresh,
  }
}

export function scannedSiteAvgScore(scores: ScannedSiteScores): number | null {
  const vals = [scores.performance, scores.accessibility, scores.bestPractices, scores.seo]
    .filter((v): v is number => v != null)
  if (!vals.length)
    return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
