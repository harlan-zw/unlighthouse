// Multi-site registry backed by the persistent sites.* API on the host.
// Mirror shape stays compatible with existing UI; per-site scans/scores are
// surfaced via the history API in the relevant pages.

import type { Site as ApiSite } from '@unlighthouse/contracts'

export interface SiteScores {
  performance: number | null
  accessibility: number | null
  bestPractices: number | null
  seo: number | null
}

export interface SiteScanRef {
  id: string
  startedAt: string
  status: 'running' | 'complete' | 'cancelled' | 'failed'
  device: 'mobile' | 'desktop'
  routes: number
  scores: SiteScores
}

export interface Site extends ApiSite {
  // Surface fields filled by the dashboard pages from history data; defaults are empty.
  latestScores: SiteScores
  trend: number[]
  scans: SiteScanRef[]
}

export interface SiteGroup {
  id: string
  name: string
}

const EMPTY_SCORES: SiteScores = {
  performance: null,
  accessibility: null,
  bestPractices: null,
  seo: null,
}

function decorate(api: ApiSite): Site {
  return {
    ...api,
    latestScores: { ...EMPTY_SCORES },
    trend: [],
    scans: [],
  }
}

export function useSites() {
  const sites = useState<Site[]>('sites', () => [])
  const loaded = useState<boolean>('sites:loaded', () => false)
  const client = useNuxtApp().$api as import('@unlighthouse/core/api/client').UnlighthouseClient

  async function refresh() {
    const res = await client['sites.list']({})
    sites.value = res.sites.map(decorate)
    loaded.value = true
  }

  if (import.meta.client && !loaded.value)
    refresh().catch(() => {})

  const groups = computed<SiteGroup[]>(() => {
    const seen = new Set<string>()
    const out: SiteGroup[] = []
    for (const s of sites.value) {
      if (!s.group || seen.has(s.group))
        continue
      seen.add(s.group)
      out.push({ id: s.group, name: s.group })
    }
    return out
  })

  const sitesByGroup = computed(() => {
    const map = new Map<string | null, Site[]>()
    for (const s of sites.value) {
      const k = s.group
      if (!map.has(k))
        map.set(k, [])
      map.get(k)!.push(s)
    }
    return map
  })

  async function addSite(input: { name?: string, url: string, group: string | null, device: 'mobile' | 'desktop' }) {
    const res = await client['sites.create']({
      name: input.name,
      url: input.url,
      group: input.group,
      device: input.device,
    })
    const decorated = decorate(res.site)
    const existing = sites.value.findIndex(s => s.id === decorated.id)
    if (existing === -1)
      sites.value = [...sites.value, decorated]
    else
      sites.value = sites.value.map((s, i) => (i === existing ? decorated : s))
    return decorated
  }

  async function removeSite(id: string) {
    await client['sites.delete']({ id })
    sites.value = sites.value.filter(s => s.id !== id)
  }

  function getSite(id: string) {
    return computed(() => sites.value.find(s => s.id === id) || null)
  }

  return { sites, groups, sitesByGroup, addSite, removeSite, getSite, refresh }
}

export function siteHostname(url: string) {
  try {
    return new URL(url).hostname
  }
  catch {
    return url
  }
}

export function siteAvgScore(scores: SiteScores): number | null {
  const vals = [scores.performance, scores.accessibility, scores.bestPractices, scores.seo].filter((v): v is number => v !== null)
  if (!vals.length)
    return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
