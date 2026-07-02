<script setup lang="ts">
import { ICON_ROLES } from '#layers/design-system/shared/icons'

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
  { label: 'Home', to: '/', icon: 'layout', active: (p: string) => p === '/' },
  { label: 'New scan', to: '/scan/new', icon: 'add', active: (p: string) => p === '/scan/new' },
]

// ── Sites list (default mode) ────────────────────────────────────────────────
// useApiQuery surfaces the error (as a normalized ApiError) rather than
// swallowing it — an unreachable host should read as "can't connect", not
// "no sites".
const { data: sitesData, error: sitesError, status: sitesStatus, refresh: refreshSites } = useApiQuery(
  'sites.list',
  () => ({}),
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
// D-045/D-049: the scan sidebar collapsed from a hand-maintained menu list
// (which had already drifted — it omitted agentic-browsing) to Overview +
// Routes, then a generated "Packs" section sourced from pack.list. Events
// demoted off the sidebar entirely — it's now a drawer on Overview (`UDrawer`,
// `EventStreamPanel`), the `/events` page is deleted, there's no standalone
// route left to link to.
// The route list (a second, always-live 500-row scan.results fetch) is gone;
// Routes is one click away.
const TOP_SCAN_LINKS = [
  { key: 'overview', label: 'Overview', icon: 'layout' },
  { key: 'routes', label: 'Routes', icon: 'list' },
]

// Curated display order for built-in packs; anything else (custom packs
// installed via unlighthouse.config.ts's `packs` channel, D-046) sorts
// alphabetically after these. `overview` never appears — it powers the
// Overview page's category scores, not a tab of its own.
const PACK_ORDER = ['cwv', 'insights', 'images', 'js-bundle', 'a11y-quick-wins', 'seo-basics', 'best-practices', 'crux', 'agentic-browsing']

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
const activePackName = computed(() => scanSeg.value === 'packs' ? (route.params.pack as string | undefined) : undefined)

// Pack authors can name any icon role on `ui.icon`, including a raw `i-*`
// iconify id (e.g. pack-nuxt's `i-logos-nuxt-icon`). Roles resolve to the
// bundled client icon set; raw ids that aren't a known role need a live
// Iconify fetch, which renders blank in offline static snapshots. Fall back
// to the bundled 'archive' role for anything not a known registry role.
function safePackIcon(icon: string | undefined): string {
  if (icon && icon in ICON_ROLES)
    return icon
  return 'archive'
}

const topScanLinks = computed(() => {
  if (!inScan.value)
    return []
  const base = scanBase.value
  return TOP_SCAN_LINKS.map(m => ({ label: m.label, to: `${base}/${m.key}`, icon: m.icon, active: () => scanSeg.value === m.key }))
})

const { data: packListData } = useApiQuery('pack.list', () => ({}), { enabled: inScan })
const packLinks = computed(() => {
  if (!inScan.value)
    return []
  const base = scanBase.value
  const packs = (packListData.value?.packs ?? []).filter(p => p.name !== 'overview')
  const sorted = [...packs].sort((a, b) => {
    const ai = PACK_ORDER.indexOf(a.name)
    const bi = PACK_ORDER.indexOf(b.name)
    if (ai !== -1 || bi !== -1)
      return (ai === -1 ? PACK_ORDER.length : ai) - (bi === -1 ? PACK_ORDER.length : bi)
    return a.name.localeCompare(b.name)
  })
  return sorted.map(p => ({
    label: p.ui.tab,
    to: `${base}/packs/${p.name}`,
    icon: safePackIcon(p.ui.icon),
    active: () => activePackName.value === p.name,
  }))
})

const compareLinks = computed(() => {
  if (!inScan.value)
    return []
  return [{ label: 'Compare', to: `/sites/${siteId.value}/compare?current=${scanId.value}`, icon: 'compare', active: () => false }]
})
</script>

<template>
  <div class="space-y-5">
    <!-- Brand / scan-context header -->
    <NuxtLink
      :to="inScan ? `/sites/${siteId}` : '/'"
      class="group/brand flex items-center gap-2 px-1 py-1 rounded-md hover:bg-elevated/60 transition-colors"
      :title="inScan ? `Back to ${scanSiteName}` : undefined"
    >
      <div class="relative flex aspect-square size-8 items-center justify-center rounded-md shrink-0 overflow-hidden" :class="inScan ? 'bg-elevated' : ''">
        <UiFavicon v-if="inScan && siteId" :domain="siteId" :size="20" :alt="`${scanSiteName} favicon`" />
        <img v-else src="/logo.png" alt="Unlighthouse" class="size-8 object-contain">
        <!-- Back affordance overlays the favicon on hover in scan mode -->
        <span
          v-if="inScan"
          class="absolute inset-0 flex items-center justify-center rounded-md bg-elevated/90 opacity-0 group-hover/brand:opacity-100 transition-opacity"
        >
          <UiIcon name="back" class="size-4" />
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
        <div class="text-label text-dimmed px-1 mb-1">
          Scan
        </div>
        <UiNavList :links="topScanLinks" />
      </div>
      <div v-if="packLinks.length">
        <div class="text-label text-dimmed px-1 mb-1">
          Packs
        </div>
        <UiNavList :links="packLinks" />
      </div>
      <div>
        <UiNavList :links="compareLinks" />
      </div>
    </template>

    <!-- ───────── Default mode ───────── -->
    <template v-else>
      <div>
        <div class="text-label text-dimmed px-1 mb-1">
          Navigation
        </div>
        <UiNavList :links="nav" />
      </div>
      <div>
        <div class="text-label text-dimmed px-1 mb-1">
          Sites
        </div>
        <!-- Connection failure must look different from "no sites yet", else an
             unreachable host silently reads as an empty registry. -->
        <div
          v-if="sitesUnreachable"
          class="flex items-start gap-2 px-1.5 py-2 rounded-md text-xs bg-error/5 text-error"
        >
          <UiIcon name="plug" class="size-3.5 shrink-0 mt-0.5" />
          <div class="min-w-0">
            <div class="font-medium">
              Can't reach the scan host
            </div>
            <button type="button" class="mt-1 inline-flex items-center gap-1 text-muted hover:text-default" @click="() => refreshSites()">
              <UiIcon name="refresh" class="size-3" /> Retry
            </button>
          </div>
        </div>
        <UiNavList v-else-if="siteLinks.length" :links="siteLinks">
          <template #icon="{ link }">
            <UiFavicon :domain="link.domain" :size="18" :alt="`${link.label} favicon`" />
          </template>
        </UiNavList>
        <NuxtLink
          v-else
          to="/"
          class="block px-1.5 py-2 rounded-md text-xs text-muted hover:text-default hover:bg-elevated transition-colors"
        >
          No sites yet. Add one
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
