<script setup lang="ts">
// The rail has two completely different modes:
//  - default: brand header, top-level Navigation, the registered Sites list.
//  - scan: when viewing a scan it transforms into a scan-focused, primary-
//    tinted rail — a context header (back to the site), the scan menus, and
//    the full list of scanned routes. The global nav steps aside so the whole
//    sidebar is about the scan you're in.
//
// Rendered as plain content inside SidebarShell's tinted <aside> (and its
// mobile drawer). Navigation rows use the design-system `UiNavList`
// primitive; the blue scan-mode wash lives on the <aside> in SidebarShell.
const route = useRoute()
const api = useApi()

const siteId = computed(() => route.params.siteId as string | undefined)
const scanId = computed(() => route.params.scanId as string | undefined)
const inScan = computed(() => !!scanId.value && !!siteId.value)

const nav = [
  { label: 'Home', to: '/', icon: 'i-lucide-layout-dashboard', active: (p: string) => p === '/' },
  { label: 'Sites', to: '/sites', icon: 'i-lucide-globe', active: (p: string) => p === '/sites' },
  { label: 'History', to: '/history', icon: 'i-lucide-history', active: (p: string) => p.startsWith('/history') },
  { label: 'New Scan', to: '/scan/new', icon: 'i-lucide-plus', active: (p: string) => p === '/scan/new' },
]

// ── Sites list (default mode) ────────────────────────────────────────────────
const { data: sitesData } = useAsyncData(
  'sidebar-sites',
  () => api['sites.list']({}).catch(() => ({ sites: [] as Array<{ id: string, name: string, url: string, group: string | null }> })),
)
const sites = computed(() => sitesData.value?.sites ?? [])
const siteLinks = computed(() => sites.value.map(site => ({
  label: site.name || siteSlug(site.url),
  to: `/sites/${siteSlug(site.url)}`,
  icon: 'i-lucide-globe',
  active: () => siteId.value === siteSlug(site.url),
})))

// ── Scan context (scan mode) ─────────────────────────────────────────────────
const SCAN_MENUS = [
  { key: 'routes', label: 'Routes', icon: 'i-lucide-list' },
  { key: 'overview', label: 'Summary', icon: 'i-lucide-layout-dashboard' },
  { key: 'performance', label: 'Performance', icon: 'i-lucide-gauge' },
  { key: 'seo', label: 'SEO', icon: 'i-lucide-search' },
  { key: 'accessibility', label: 'Accessibility', icon: 'i-lucide-accessibility' },
  { key: 'best-practices', label: 'Best Practices', icon: 'i-lucide-shield-check' },
  { key: 'crux', label: 'CrUX', icon: 'i-lucide-globe' },
  { key: 'events', label: 'Events', icon: 'i-lucide-radio' },
]

const scanBase = computed(() => `/sites/${siteId.value}/scans/${scanId.value}`)
const scanSeg = computed(() => {
  if (!inScan.value)
    return ''
  const prefix = `${scanBase.value}/`
  if (!route.path.startsWith(prefix))
    return 'routes'
  const seg = route.path.slice(prefix.length).split('/')[0] || 'routes'
  return seg === 'route' ? 'routes' : seg
})

const scanLinks = computed(() => {
  if (!inScan.value)
    return []
  const base = scanBase.value
  return [
    ...SCAN_MENUS.map(m => ({ label: m.label, to: `${base}/${m.key}`, icon: m.icon, active: () => scanSeg.value === m.key })),
    { label: 'Compare', to: `/compare/${scanId.value}`, icon: 'i-lucide-git-compare', active: () => false },
  ]
})

const { data: scanRoutesData } = useAsyncData(
  'sidebar-scan-routes',
  () => {
    if (!scanId.value)
      return Promise.resolve(null)
    return api['scan.results']({ scanId: scanId.value, page: 1, pageSize: 500 }).catch(() => null)
  },
  { watch: [scanId] },
)
const uniqueRoutes = computed(() => {
  const seen = new Set<string>()
  const out: Array<{ path: string }> = []
  for (const r of (scanRoutesData.value?.items ?? []) as Array<{ url: string, path: string }>) {
    const p = r.path || r.url
    if (seen.has(p))
      continue
    seen.add(p)
    out.push({ path: p })
  }
  return out
})
const activeRoutePath = computed(() => (route.params.path ? decodeURIComponent(route.params.path as string) : null))
const routeLinks = computed(() => uniqueRoutes.value.map(r => ({
  label: r.path,
  to: `${scanBase.value}/route/${encodeURIComponent(r.path)}`,
  active: () => activeRoutePath.value === r.path,
})))
</script>

<template>
  <div class="space-y-5">
    <!-- Brand / scan-context header -->
    <NuxtLink
      :to="inScan ? `/sites/${siteId}` : '/'"
      class="flex items-center gap-2 px-1 py-1 rounded-md hover:bg-elevated/60 transition-colors"
    >
      <div class="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-inverted shrink-0">
        <Icon :name="inScan ? 'lucide:arrow-left' : 'lucide:radar'" class="size-4" />
      </div>
      <div class="grid flex-1 text-left text-sm leading-tight min-w-0">
        <span class="truncate font-semibold">{{ inScan ? siteId : 'Unlighthouse' }}</span>
        <span class="truncate text-xs text-muted" :class="inScan ? 'font-mono' : ''">
          {{ inScan ? `scan ${scanId?.slice(0, 8)}` : 'Site auditing' }}
        </span>
      </div>
    </NuxtLink>

    <!-- ───────── Scan mode ───────── -->
    <template v-if="inScan">
      <div>
        <div class="text-label text-dimmed px-1 mb-1">Scan</div>
        <UiNavList :links="scanLinks" />
      </div>
      <div v-if="routeLinks.length">
        <div class="text-label text-dimmed px-1 mb-1">Routes · {{ routeLinks.length }}</div>
        <UiNavList :links="routeLinks" />
      </div>
    </template>

    <!-- ───────── Default mode ───────── -->
    <template v-else>
      <div>
        <div class="text-label text-dimmed px-1 mb-1">Navigation</div>
        <UiNavList :links="nav" />
      </div>
      <div v-if="siteLinks.length">
        <div class="text-label text-dimmed px-1 mb-1">Sites</div>
        <UiNavList :links="siteLinks" />
      </div>
    </template>
  </div>
</template>
