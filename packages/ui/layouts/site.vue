<script setup lang="ts">
import type { NavLink } from '~/components/NavList.vue'
import { siteHostname, siteIdForScan, useSites } from '~/composables/sites'
import { useHistoricalScan } from '~/composables/useHistoricalScan'
import { useUnlighthouseConfig } from '~/composables/useUnlighthouseConfig'

const route = useRoute()
const router = useRouter()
const { sites } = useSites()
const { apiUrl, website } = useUnlighthouseConfig()

const siteId = computed(() => {
  if (route.params.siteId)
    return route.params.siteId as string
  if (route.params.scanId)
    return siteIdForScan(route.params.scanId as string, sites.value) ?? ''
  return ''
})
const site = computed(() => sites.value.find(s => s.id === siteId.value) ?? null)

const switcherOpen = ref(false)

const scanId = computed(() => route.params.scanId as string | undefined)
const isResultsRoute = computed(() => !!scanId.value)

const siteLinks = computed<NavLink[]>(() => {
  if (!siteId.value)
    return []
  const base = `/sites/${siteId.value}`
  return [
    { label: 'Overview', to: base, icon: 'i-heroicons-squares-2x2', exact: true },
    { label: 'History', to: `${base}/history`, icon: 'i-heroicons-clock' },
    { label: 'Settings', to: `${base}/settings`, icon: 'i-heroicons-cog-6-tooth' },
  ]
})

const resultsLinks = computed<NavLink[]>(() => {
  if (!scanId.value)
    return []
  const base = `/results/${scanId.value}`
  return [
    { label: 'Overview', to: base, icon: 'i-heroicons-squares-2x2', exact: true },
    { label: 'Performance', to: `${base}/performance`, icon: 'i-heroicons-bolt', iconClass: 'text-success' },
    { label: 'Accessibility', to: `${base}/accessibility`, icon: 'i-heroicons-eye', iconClass: 'text-info' },
    { label: 'Best Practices', to: `${base}/best-practices`, icon: 'i-heroicons-shield-check', iconClass: 'text-secondary' },
    { label: 'SEO', to: `${base}/seo`, icon: 'i-heroicons-magnifying-glass', iconClass: 'text-warning' },
  ]
})

function changeSite(newId: string) {
  switcherOpen.value = false
  router.push(`/sites/${newId}`)
}

// Results pages inject siteUrl to resolve relative asset URLs (a11y screenshots etc.).
// Falls back to the scan's stored site URL via /history/:scanId when no dummy site matches.
const historicalScanId = computed(() => site.value ? undefined : scanId.value)
const { data: historicalScan } = useHistoricalScan(historicalScanId)

const siteUrl = computed(() => site.value?.url || historicalScan.value?.site || website.value)
provide('siteUrl', siteUrl)
provide('historicalScan', historicalScan)
</script>

<template>
  <DashboardShell logo-to="/">
    <template #sidebar="{ closeNav }">
      <NuxtLink
        to="/"
        class="flex items-center gap-1.5 px-2 text-[11px] text-muted hover:text-default transition-colors"
        @click="closeNav()"
      >
        <UIcon name="i-heroicons-arrow-left" class="size-3" aria-hidden="true" />
        All sites
      </NuxtLink>

      <div v-if="site" class="space-y-1">
        <UPopover v-model:open="switcherOpen" :ui="{ content: 'p-0' }">
          <button
            class="flex items-center gap-2 w-full p-2 rounded-lg ring-1 ring-default bg-elevated/40 hover:bg-elevated transition-colors text-left"
            aria-label="Switch site"
          >
            <SiteFavicon :url="site.url" :alt="site.name" class="size-5" />
            <div class="flex-1 min-w-0">
              <p class="text-[13px] font-medium truncate text-default leading-tight">
                {{ site.name }}
              </p>
              <p class="text-[11px] text-dimmed truncate leading-tight">
                {{ siteHostname(site.url) }}
              </p>
            </div>
            <UIcon name="i-heroicons-chevron-up-down" class="size-3.5 text-dimmed shrink-0" aria-hidden="true" />
          </button>
          <template #content>
            <div class="w-64 max-h-80 overflow-y-auto p-1" role="listbox">
              <button
                v-for="s in sites"
                :key="s.id"
                class="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-md text-left transition-colors"
                :class="s.id === site.id ? 'bg-elevated text-highlighted' : 'hover:bg-elevated/60'"
                role="option"
                :aria-selected="s.id === site.id"
                @click="changeSite(s.id)"
              >
                <SiteFavicon :url="s.url" :alt="s.name" class="size-4" />
                <span class="text-[13px] truncate flex-1">{{ s.name }}</span>
                <UIcon v-if="s.id === site.id" name="i-heroicons-check" class="size-3.5 text-success shrink-0" aria-hidden="true" />
              </button>
            </div>
          </template>
        </UPopover>
      </div>

      <NavList :links="siteLinks" />

      <div v-if="isResultsRoute && resultsLinks.length">
        <div class="text-[11px] font-semibold text-dimmed uppercase tracking-widest mb-2 px-2">
          Current scan
        </div>
        <NavList :links="resultsLinks" />
      </div>

      <div v-if="site && site.scans.length" class="pt-2">
        <div class="text-[11px] font-semibold text-dimmed uppercase tracking-widest mb-2 px-2">
          Recent scans
        </div>
        <nav class="space-y-0.5 bg-muted/40 rounded p-1">
          <NuxtLink
            v-for="scan in site.scans.slice(0, 6)"
            :key="scan.id"
            :to="`/results/${encodeURIComponent(scan.id)}`"
            class="flex items-center gap-1.5 px-1.5 py-1 rounded text-sm text-muted hover:text-default hover:bg-elevated/70 transition-colors"
            @click="closeNav()"
          >
            <UIcon name="i-heroicons-document-chart-bar" class="size-3.5 text-dimmed shrink-0" aria-hidden="true" />
            <span class="truncate text-[12px]">
              {{ new Date(scan.startedAt).toLocaleDateString() }}
            </span>
            <span class="ml-auto text-[11px] text-dimmed">{{ scan.device }}</span>
          </NuxtLink>
        </nav>
      </div>
    </template>

    <div v-if="route.params.siteId && !site" class="max-w-md mx-auto py-20 text-center">
      <UIcon name="i-heroicons-question-mark-circle" class="size-12 text-dimmed mx-auto mb-4" />
      <h1 class="text-xl font-semibold mb-2">
        Site not found
      </h1>
      <p class="text-muted mb-6">
        This site no longer exists or was removed.
      </p>
      <UButton to="/" icon="i-heroicons-arrow-left" color="primary">
        Back to sites
      </UButton>
    </div>
    <slot v-else />
  </DashboardShell>
</template>
