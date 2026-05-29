<script setup lang="ts">
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

// The rail has two completely different modes:
//  - default: brand header, top-level Navigation, the registered Sites list.
//  - scan: when viewing a scan it transforms into a scan-focused, primary-
//    tinted rail — a context header (back to the site), the scan menus, and
//    the full list of scanned routes. The global nav steps aside so the whole
//    sidebar is about the scan you're in.
const route = useRoute()
const api = useApi()

const siteId = computed(() => route.params.siteId as string | undefined)
const scanId = computed(() => route.params.scanId as string | undefined)
const inScan = computed(() => !!scanId.value && !!siteId.value)

interface NavItem {
  label: string
  to: string
  icon: string
  match: (path: string) => boolean
}

const nav: NavItem[] = [
  { label: 'Home', to: '/', icon: 'lucide:layout-dashboard', match: p => p === '/' },
  { label: 'Sites', to: '/sites', icon: 'lucide:globe', match: p => p === '/sites' },
  { label: 'History', to: '/history', icon: 'lucide:history', match: p => p.startsWith('/history') },
  { label: 'New Scan', to: '/scan/new', icon: 'lucide:plus', match: p => p === '/scan/new' },
]

// ── Sites list (default mode) ────────────────────────────────────────────────
const { data: sitesData } = useAsyncData(
  'sidebar-sites',
  () => api['sites.list']({}).catch(() => ({ sites: [] as Array<{ id: string, name: string, url: string, group: string | null }> })),
)
const sites = computed(() => sitesData.value?.sites ?? [])

// ── Scan context (scan mode) ─────────────────────────────────────────────────
const SCAN_MENUS = [
  { key: 'routes', label: 'Routes', icon: 'lucide:list' },
  { key: 'overview', label: 'Summary', icon: 'lucide:layout-dashboard' },
  { key: 'performance', label: 'Performance', icon: 'lucide:gauge' },
  { key: 'seo', label: 'SEO', icon: 'lucide:search' },
  { key: 'accessibility', label: 'Accessibility', icon: 'lucide:accessibility' },
  { key: 'best-practices', label: 'Best Practices', icon: 'lucide:shield-check' },
  { key: 'crux', label: 'CrUX', icon: 'lucide:globe' },
  { key: 'events', label: 'Events', icon: 'lucide:radio' },
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

// Primary-tinted palette for scan mode — overrides the sidebar CSS tokens so
// the whole rail (and its accents) shifts colour. color-mix against
// --background keeps it correct in both light and dark themes.
// A cool blue wash (distinct from the near-black primary) so entering a scan
// is an obvious context shift. color-mix against --background keeps it sane in
// both themes; the accent tints the active row + hover too.
const scanTint = '[--sidebar:color-mix(in_srgb,#3b82f6_10%,var(--background))] [--sidebar-border:color-mix(in_srgb,#3b82f6_28%,var(--background))] [--sidebar-accent:color-mix(in_srgb,#3b82f6_22%,var(--background))] [--sidebar-accent-foreground:var(--foreground)]'
</script>

<template>
  <Sidebar collapsible="icon" :class="inScan ? scanTint : ''">
    <SidebarHeader>
      <SidebarMenu>
        <!-- Scan mode: context header (back to the site) -->
        <SidebarMenuItem v-if="inScan">
          <SidebarMenuButton size="lg" as-child :tooltip="siteId">
            <NuxtLink :to="`/sites/${siteId}`">
              <div class="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Icon name="lucide:arrow-left" class="size-4" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">{{ siteId }}</span>
                <span class="truncate text-xs text-muted-foreground font-mono">scan {{ scanId?.slice(0, 8) }}</span>
              </div>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>

        <!-- Default mode: brand header -->
        <SidebarMenuItem v-else>
          <SidebarMenuButton size="lg" as-child tooltip="Unlighthouse">
            <NuxtLink to="/">
              <div class="flex aspect-square size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                <Icon name="lucide:radar" class="size-4" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">Unlighthouse</span>
                <span class="truncate text-xs text-muted-foreground">Site auditing</span>
              </div>
            </NuxtLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <!-- ───────── Scan mode ───────── -->
    <SidebarContent v-if="inScan">
      <SidebarGroup>
        <SidebarGroupLabel>Scan</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="m in SCAN_MENUS" :key="m.key">
              <SidebarMenuButton as-child :is-active="scanSeg === m.key" :tooltip="m.label">
                <NuxtLink :to="`${scanBase}/${m.key}`">
                  <Icon :name="m.icon" />
                  <span>{{ m.label }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton as-child tooltip="Compare">
                <NuxtLink :to="`/compare/${scanId}`">
                  <Icon name="lucide:git-compare" />
                  <span>Compare</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup v-if="uniqueRoutes.length">
        <SidebarGroupLabel>Routes · {{ uniqueRoutes.length }}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="r in uniqueRoutes" :key="r.path">
              <SidebarMenuButton as-child size="sm" :is-active="activeRoutePath === r.path" :tooltip="r.path">
                <NuxtLink :to="`${scanBase}/route/${encodeURIComponent(r.path)}`">
                  <span class="truncate font-mono text-xs">{{ r.path }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>

    <!-- ───────── Default mode ───────── -->
    <SidebarContent v-else>
      <SidebarGroup>
        <SidebarGroupLabel>Navigation</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in nav" :key="item.to">
              <SidebarMenuButton as-child :is-active="item.match(route.path)" :tooltip="item.label">
                <NuxtLink :to="item.to">
                  <Icon :name="item.icon" />
                  <span>{{ item.label }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <SidebarGroup v-if="sites.length">
        <SidebarGroupLabel>Sites</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="site in sites" :key="site.id">
              <SidebarMenuButton
                as-child
                :is-active="siteId === siteSlug(site.url)"
                :tooltip="siteSlug(site.url)"
              >
                <NuxtLink :to="`/sites/${siteSlug(site.url)}`">
                  <Icon name="lucide:globe" />
                  <span>{{ site.name || siteSlug(site.url) }}</span>
                </NuxtLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
  </Sidebar>
</template>
