// Dummy multi-site model. Real backend wiring lives behind the same shape so
// pages and layouts can be built against it now and swapped to a real source
// later without UI churn.

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

export interface Site {
  id: string
  name: string
  url: string
  group: string | null
  device: 'mobile' | 'desktop'
  latestScores: SiteScores
  // 30-day rolling average for the sparkline on tiles
  trend: number[]
  scans: SiteScanRef[]
  createdAt: string
}

export interface SiteGroup {
  id: string
  name: string
}

const DUMMY_GROUPS: SiteGroup[] = [
  { id: 'production', name: 'Production' },
  { id: 'staging', name: 'Staging' },
]

function sparkline(seed: number, points = 30): number[] {
  const out: number[] = []
  let v = seed
  for (let i = 0; i < points; i++) {
    v += (Math.sin(i * 0.6 + seed) + (Math.random() - 0.5)) * 3
    v = Math.max(20, Math.min(100, v))
    out.push(Math.round(v))
  }
  return out
}

function makeScans(siteUrl: string, count: number): SiteScanRef[] {
  const out: SiteScanRef[] = []
  const now = Date.now()
  for (let i = 0; i < count; i++) {
    const startedAt = new Date(now - i * 86_400_000 - Math.random() * 3_600_000).toISOString()
    out.push({
      id: `${siteUrl}-${i}`,
      startedAt,
      status: i === 0 ? 'complete' : (Math.random() > 0.9 ? 'failed' : 'complete'),
      device: Math.random() > 0.4 ? 'mobile' : 'desktop',
      routes: 20 + Math.floor(Math.random() * 80),
      scores: {
        performance: 50 + Math.floor(Math.random() * 50),
        accessibility: 70 + Math.floor(Math.random() * 30),
        bestPractices: 80 + Math.floor(Math.random() * 20),
        seo: 75 + Math.floor(Math.random() * 25),
      },
    })
  }
  return out
}

function seed(): Site[] {
  const defs: Array<Pick<Site, 'name' | 'url' | 'group' | 'device'>> = [
    { name: 'Marketing', url: 'https://example.com', group: 'production', device: 'mobile' },
    { name: 'Docs', url: 'https://docs.example.com', group: 'production', device: 'desktop' },
    { name: 'Blog', url: 'https://blog.example.com', group: 'production', device: 'mobile' },
    { name: 'Staging', url: 'https://staging.example.com', group: 'staging', device: 'mobile' },
  ]
  return defs.map((d, i) => {
    const scans = makeScans(d.url, 12)
    return {
      id: encodeURIComponent(new URL(d.url).hostname),
      ...d,
      latestScores: scans[0]!.scores,
      trend: sparkline(60 + i * 5),
      scans,
      createdAt: new Date(Date.now() - (60 + i * 10) * 86_400_000).toISOString(),
    }
  })
}

export function useSites() {
  const sites = useState<Site[]>('sites', () => seed())
  const groups = useState<SiteGroup[]>('site-groups', () => DUMMY_GROUPS)

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

  function addSite(input: { name: string, url: string, group: string | null, device: 'mobile' | 'desktop' }) {
    const id = encodeURIComponent(new URL(input.url).hostname)
    if (sites.value.some(s => s.id === id))
      return sites.value.find(s => s.id === id)!
    const site: Site = {
      id,
      name: input.name || new URL(input.url).hostname,
      url: input.url,
      group: input.group,
      device: input.device,
      latestScores: { performance: null, accessibility: null, bestPractices: null, seo: null },
      trend: [],
      scans: [],
      createdAt: new Date().toISOString(),
    }
    sites.value = [...sites.value, site]
    return site
  }

  function removeSite(id: string) {
    sites.value = sites.value.filter(s => s.id !== id)
  }

  function getSite(id: string) {
    return computed(() => sites.value.find(s => s.id === id) || null)
  }

  return { sites, groups, sitesByGroup, addSite, removeSite, getSite }
}

export function siteHostname(url: string) {
  try {
    return new URL(url).hostname
  }
  catch {
    return url
  }
}

export function siteIdForScan(scanId: string, sites: Site[]): string | null {
  for (const s of sites) {
    if (s.scans.some(sc => sc.id === scanId))
      return s.id
  }
  return null
}

export function siteAvgScore(scores: SiteScores): number | null {
  const vals = [scores.performance, scores.accessibility, scores.bestPractices, scores.seo].filter((v): v is number => v !== null)
  if (!vals.length)
    return null
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
}
