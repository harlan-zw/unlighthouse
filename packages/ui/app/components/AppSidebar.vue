<script setup lang="ts">
import { useNavDrawer } from '#layers/design-system/app/components/container/ui-nav-drawer'
import { ICON_ROLES } from '#layers/design-system/shared/icons'
import { siteSlug } from '~/utils/site'

const route = useRoute()
const isStatic = useIsStatic()
const { keepOpenFor } = useNavDrawer()
const siteId = computed(() => route.params.siteId as string | undefined)
const scanId = computed(() => route.params.scanId as string | undefined)
const inScan = computed(() => !!scanId.value && !!siteId.value)
const inAgents = computed(() => route.path === '/agents')
const lastBrowse = useState('navigation:last-browse', () => '/')
watch(() => route.fullPath, () => {
  if (!inAgents.value)
    lastBrowse.value = route.fullPath
}, { immediate: true })

const { data: sitesData, error: sitesError, status: sitesStatus, refresh: refreshSites } = useApiQuery('sites.list', () => ({}))
const sites = computed(() => sitesData.value?.sites ?? [])
const currentSite = computed(() => sites.value.find(site => siteSlug(site.url) === siteId.value))
const agentDestination = computed(() => ({ path: '/agents', query: currentSite.value ? { site: currentSite.value.url } : inAgents.value ? route.query : {} }))
const modes = computed(() => [
  { label: 'Browse', to: lastBrowse.value, active: !inAgents.value },
  { label: 'Agents', to: agentDestination.value, active: inAgents.value },
])
const nav = computed(() => [
  { label: 'Sites', to: '/', icon: 'layout', active: (path: string) => path === '/' },
  ...(!isStatic ? [{ label: 'Run scan', to: '/scan/new', icon: 'add' }] : []),
])
const siteLinks = computed(() => sites.value.map(site => ({
  label: site.name || siteSlug(site.url),
  to: `/sites/${encodeURIComponent(siteSlug(site.url))}`,
  domain: siteSlug(site.url),
  active: () => siteId.value === siteSlug(site.url),
})))
const scanBase = computed(() => `/sites/${encodeURIComponent(siteId.value || '')}/scans/${scanId.value}`)
const scanSeg = computed(() => route.path.match(/\/scans\/[^/]+\/([^/]+)/)?.[1] || 'routes')
const topScanLinks = computed(() => [
  { label: 'Overview', to: `${scanBase.value}/overview`, icon: 'layout', active: () => scanSeg.value === 'overview' },
  { label: 'Routes', to: `${scanBase.value}/routes`, icon: 'list', active: () => ['routes', 'route'].includes(scanSeg.value) },
])
const PACK_ORDER = ['cwv', 'insights', 'images', 'js-bundle', 'a11y-quick-wins', 'seo-basics', 'best-practices', 'crux', 'agentic-browsing']
const { data: packListData } = useApiQuery('pack.list', () => ({}), { enabled: inScan })
const packLinks = computed(() => [...(packListData.value?.packs ?? [])]
  .filter(pack => pack.name !== 'overview')
  .sort((a, b) => {
    const ai = PACK_ORDER.indexOf(a.name)
    const bi = PACK_ORDER.indexOf(b.name)
    return ai !== -1 || bi !== -1
      ? (ai === -1 ? PACK_ORDER.length : ai) - (bi === -1 ? PACK_ORDER.length : bi)
      : a.name.localeCompare(b.name)
  })
  .map(pack => ({
    label: pack.ui.tab,
    to: `${scanBase.value}/packs/${pack.name}`,
    icon: pack.ui.icon && pack.ui.icon in ICON_ROLES ? pack.ui.icon : 'archive',
    active: () => route.params.pack === pack.name,
  })))
const compareLinks = computed(() => isStatic
  ? []
  : [{
      label: 'Compare scans',
      to: `/sites/${encodeURIComponent(siteId.value || '')}/compare?current=${scanId.value}`,
      icon: 'compare',
    }])
const agentLinks = computed(() => [
  { label: 'MCP', to: `/agents${route.query.site ? `?site=${encodeURIComponent(String(route.query.site))}` : ''}#mcp`, icon: 'terminal', active: () => route.hash !== '#skill' },
  { label: 'Skill', to: `/agents${route.query.site ? `?site=${encodeURIComponent(String(route.query.site))}` : ''}#skill`, icon: 'book', active: () => route.hash === '#skill' },
])
</script>

<template>
  <div class="flex min-h-full flex-col gap-4">
    <nav aria-label="Workspace modes" class="flex items-center gap-4">
      <NuxtLink v-for="mode in modes" :key="mode.label" :to="mode.to" :aria-current="mode.active ? 'page' : undefined" class="flex min-h-11 min-w-11 items-center px-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary lg:min-h-8" :class="mode.active ? 'font-semibold text-highlighted' : 'text-muted hover:text-default'" @click="keepOpenFor(mode.to)">
        <span class="border-b py-1" :class="mode.active ? 'border-inverted' : 'border-transparent'">{{ mode.label }}</span>
      </NuxtLink>
    </nav>
    <UiNavList v-if="inAgents" :links="agentLinks" variant="sidebar" label="Agent setup" />
    <template v-else-if="inScan">
      <UiNavList :links="[{ label: 'All sites', to: '/', icon: 'back' }, { label: 'Scan history', to: `/sites/${encodeURIComponent(siteId || '')}`, icon: 'history' }]" variant="sidebar" label="Site navigation" />
      <div class="space-y-2 border-t border-default pt-4">
        <span class="px-1 text-sm text-muted font-mono">{{ scanId?.slice(0, 8) }}</span>
        <UiNavList :links="topScanLinks" variant="sidebar" label="Scan navigation" />
      </div>
      <div v-if="packLinks.length" class="space-y-2">
        <h2 class="px-1 text-sm font-medium text-muted">
          Packs
        </h2>
        <UiNavList :links="packLinks" variant="sidebar" label="Scan packs" />
      </div>
      <UiNavList :links="compareLinks" variant="sidebar" label="Scan comparison" />
    </template>
    <template v-else>
      <UiNavList :links="nav" variant="sidebar" label="Primary navigation" />
      <div class="space-y-2 border-t border-default pt-4">
        <h2 class="px-1 text-sm font-medium text-muted">
          Sites
        </h2>
        <div v-if="sitesError" class="space-y-2 px-1 text-sm text-error" role="alert">
          <p>Can't reach the scan host</p>
          <UiButton purpose="quiet" icon="refresh" @click="() => refreshSites()">
            Retry sites
          </UiButton>
        </div>
        <UiSkeleton v-else-if="sitesStatus === 'pending' && !sites.length" class="h-11 w-full" />
        <UiNavList v-else-if="siteLinks.length" :links="siteLinks" variant="sidebar" label="Sites">
          <template #icon="{ link }">
            <UiFavicon :domain="link.domain" :size="18" alt="" />
          </template>
        </UiNavList>
        <NuxtLink v-else to="/" class="flex min-h-11 items-center px-1 text-sm text-muted hover:text-default">
          Add site
        </NuxtLink>
      </div>
    </template>
  </div>
</template>
