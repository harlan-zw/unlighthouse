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

// Resolve the friendly site name for the scan-mode header — the route param is
// just the hostname slug, so fall back to it when the site isn't in the
// registry (e.g. deleted site whose scans remain).
const scanSiteName = computed(() => {
  const slug = siteId.value
  if (!slug)
    return ''
  return sites.value.find(s => siteSlug(s.url) === slug)?.name || slug
})

const nav = [
  { label: 'Home', to: '/', icon: 'i-lucide-layout-dashboard', active: (p: string) => p === '/' },
  { label: 'Sites', to: '/sites', icon: 'i-lucide-globe', active: (p: string) => p === '/sites' },
  { label: 'History', to: '/history', icon: 'i-lucide-history', active: (p: string) => p.startsWith('/history') },
  { label: 'New Scan', to: '/scan/new', icon: 'i-lucide-plus', active: (p: string) => p === '/scan/new' },
]

// ── Sites list (default mode) ────────────────────────────────────────────────
// Let useAsyncData surface the error rather than swallowing it with .catch —
// an unreachable host should read as "can't connect", not "no sites".
const { data: sitesData, error: sitesError, status: sitesStatus, refresh: refreshSites } = useAsyncData(
  'sidebar-sites',
  () => api['sites.list']({}),
)
const sites = computed(() => sitesData.value?.sites ?? [])
const sitesUnreachable = computed(() => sitesStatus.value === 'error' || !!sitesError.value)
const siteLinks = computed(() => sites.value.map(site => ({
  label: site.name || siteSlug(site.url),
  to: `/sites/${siteSlug(site.url)}`,
  // Carry the host so the sidebar can render the site's real favicon
  // (via the UiNavList `icon` slot) instead of a generic globe glyph.
  domain: siteSlug(site.url),
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
      class="group/brand flex items-center gap-2 px-1 py-1 rounded-md hover:bg-elevated/60 transition-colors"
      :title="inScan ? `Back to ${scanSiteName}` : undefined"
    >
      <div class="relative flex aspect-square size-8 items-center justify-center rounded-md shrink-0" :class="inScan ? 'bg-elevated' : 'bg-primary text-inverted'">
        <Favicon v-if="inScan && siteId" :domain="siteId" :size="20" :alt="`${scanSiteName} favicon`" />
        <Icon v-else name="lucide:radar" class="size-4" />
        <!-- Back affordance overlays the favicon on hover in scan mode -->
        <span
          v-if="inScan"
          class="absolute inset-0 flex items-center justify-center rounded-md bg-elevated/90 opacity-0 group-hover/brand:opacity-100 transition-opacity"
        >
          <Icon name="lucide:arrow-left" class="size-4" />
        </span>
      </div>
      <div class="grid flex-1 text-left text-sm leading-tight min-w-0">
        <span class="truncate font-semibold">{{ inScan ? scanSiteName : 'Unlighthouse' }}</span>
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
      <div>
        <div class="text-label text-dimmed px-1 mb-1">Sites</div>
        <!-- Connection failure must look different from "no sites yet", else an
             unreachable host silently reads as an empty registry. -->
        <div
          v-if="sitesUnreachable"
          class="flex items-start gap-2 px-1.5 py-2 rounded-md text-xs bg-error/5 text-error"
        >
          <Icon name="lucide:plug-zap" class="size-3.5 shrink-0 mt-0.5" />
          <div class="min-w-0">
            <div class="font-medium">Can't reach the scan host</div>
            <button type="button" class="mt-1 inline-flex items-center gap-1 text-muted hover:text-default" @click="() => refreshSites()">
              <Icon name="lucide:rotate-cw" class="size-3" /> Retry
            </button>
          </div>
        </div>
        <UiNavList v-else-if="siteLinks.length" :links="siteLinks">
          <template #icon="{ link }">
            <Favicon :domain="link.domain" :size="18" :alt="`${link.label} favicon`" />
          </template>
        </UiNavList>
        <NuxtLink
          v-else
          to="/sites"
          class="block px-1.5 py-2 rounded-md text-xs text-muted hover:text-default hover:bg-elevated transition-colors"
        >
          No sites yet — add one
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
