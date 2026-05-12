<script setup lang="ts">
import type { NavLink } from '~/components/NavList.vue'
import { rescanSite } from '~/composables/actions'
import { isDebugModalOpen, isOffline, openDebugModal } from '~/composables/state'
import { apiUrl, isStatic, website } from '~/composables/unlighthouse'

const route = useRoute()
const toast = useToast()

const scanId = computed(() => route.params.scanId as string | undefined)
const isResultsRoute = computed(() => route.path.startsWith('/results/'))

const historicalScan = ref<{ site: string, device: string, routes: any[] } | null>(null)
const isHistorical = computed(() => !!scanId.value && !!historicalScan.value)

watch(scanId, async (id) => {
  if (!id) {
    historicalScan.value = null
    return
  }
  historicalScan.value = await $fetch<any>(`${apiUrl.value}/history/${id}`).catch(() => null)
}, { immediate: true })

const displayWebsite = computed(() => isHistorical.value ? historicalScan.value?.site : website.value)
const displayDevice = computed(() => isHistorical.value ? historicalScan.value?.device : null)

function extractDomain(url: string) {
  try { return new URL(url).hostname }
  catch { return url }
}

const categoryLinks = computed<NavLink[]>(() => scanId.value
  ? [
      { label: 'Overview', to: `/results/${scanId.value}`, icon: 'i-heroicons-squares-2x2', iconClass: 'text-default', exact: true },
      { label: 'Performance', to: `/results/${scanId.value}/performance`, icon: 'i-heroicons-bolt', iconClass: 'text-success' },
      { label: 'Accessibility', to: `/results/${scanId.value}/accessibility`, icon: 'i-heroicons-eye', iconClass: 'text-info' },
      { label: 'Best Practices', to: `/results/${scanId.value}/best-practices`, icon: 'i-heroicons-shield-check', iconClass: 'text-secondary' },
      { label: 'SEO', to: `/results/${scanId.value}/seo`, icon: 'i-heroicons-magnifying-glass', iconClass: 'text-warning' },
    ]
  : [])

const topLinks: NavLink[] = [
  { label: 'New Scan', to: '/onboarding', icon: 'i-heroicons-plus' },
  { label: 'History', to: '/history', icon: 'i-heroicons-clock' },
]

async function copyShareLink() {
  if (scanId.value) {
    await navigator.clipboard.writeText(`${window.location.origin}/results/${scanId.value}`)
    toast.add({ title: 'Link copied!', description: 'Share this link to view this scan.', color: 'success' })
    return
  }
  const data = await $fetch<{ scanId: string | null }>(`${apiUrl.value}/current-scan-id`).catch(() => null)
  if (data?.scanId) {
    await navigator.clipboard.writeText(`${window.location.origin}/results/${data.scanId}`)
    toast.add({ title: 'Link copied!', description: 'Share this link to view this scan.', color: 'success' })
  }
  else {
    toast.add({ title: 'No scan to share', description: 'Start a scan first to generate a shareable link.', color: 'warning' })
  }
}

provide('siteUrl', displayWebsite)
</script>

<template>
  <DashboardShell logo-to="/history">
    <template #sidebar="{ closeNav }">
      <NavList :links="topLinks" />

      <div v-if="isResultsRoute && categoryLinks.length">
        <div class="text-[11px] font-semibold text-dimmed uppercase tracking-widest mb-2 px-2">
          Categories
        </div>
        <NavList :links="categoryLinks" />
      </div>

      <div v-if="displayWebsite && isResultsRoute" class="px-2 py-3 rounded-lg bg-muted/40 border border-default">
        <div class="flex items-center gap-2 min-w-0">
          <img
            :src="`https://www.google.com/s2/favicons?domain=${extractDomain(displayWebsite)}&sz=32`"
            :alt="displayWebsite"
            class="w-4 h-4 rounded shrink-0"
            loading="lazy"
            width="16"
            height="16"
          >
          <a
            :href="displayWebsite"
            target="_blank"
            class="text-xs text-muted hover:text-default transition-colors font-mono truncate"
          >
            {{ extractDomain(displayWebsite) }}
          </a>
        </div>
        <div v-if="displayDevice || isHistorical" class="mt-2 flex items-center gap-2 text-[11px] text-dimmed">
          <span v-if="displayDevice" class="capitalize">{{ displayDevice }}</span>
          <span v-if="isHistorical" class="px-1.5 py-0.5 rounded bg-info/10 text-info">Historical</span>
        </div>
        <div class="mt-2 flex items-center gap-1">
          <UButton
            icon="i-heroicons-share"
            variant="ghost"
            color="neutral"
            size="xs"
            aria-label="Copy share link"
            title="Copy share link"
            @click="copyShareLink"
          />
          <template v-if="!isHistorical">
            <UButton
              icon="i-heroicons-arrow-path"
              variant="ghost"
              color="neutral"
              size="xs"
              :disabled="isStatic || isOffline"
              aria-label="Rescan all routes"
              title="Rescan all"
              @click="rescanSite"
            />
            <UButton
              icon="i-heroicons-cog-6-tooth"
              variant="ghost"
              color="neutral"
              size="xs"
              aria-label="Open debug panel"
              title="Debug"
              @click="openDebugModal"
            />
          </template>
        </div>
      </div>

      <SidebarHistory :close-nav="closeNav" />
    </template>

    <slot />

    <UModal v-model:open="isDebugModalOpen" title="Debug">
      <template #body>
        <div class="space-y-4 p-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="text-muted">
              Scan ID
            </div>
            <div class="font-mono text-default">
              {{ scanId }}
            </div>
            <div class="text-muted">
              Device
            </div>
            <div class="font-mono capitalize text-default">
              {{ displayDevice }}
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </DashboardShell>
</template>
