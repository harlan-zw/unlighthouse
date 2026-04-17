<script setup lang="ts">
import {
  lighthouseReportModalOpen,
  iframeModalUrl,
  isDebugModalOpen,
  scanMeta,
  isOffline,
  openDebugModal,
} from '~/composables/state'
import { isStatic, website, device, apiUrl } from '~/composables/unlighthouse'
import { rescanSite } from '~/composables/actions'

const route = useRoute()
const toast = useToast()

const scanId = computed(() => route.params.scanId as string | undefined)
const historicalScan = ref<{ site: string, device: string, routes: any[] } | null>(null)
const isHistorical = computed(() => !!scanId.value && !!historicalScan.value)

watch(scanId, async (id) => {
  if (!id) {
    historicalScan.value = null
    return
  }
  const data = await $fetch<any>(`${apiUrl.value}/history/${id}`).catch(() => null)
  historicalScan.value = data
}, { immediate: true })

const displayWebsite = computed(() => isHistorical.value ? historicalScan.value?.site : website.value)
const displayDevice = computed(() => isHistorical.value ? historicalScan.value?.device : device.value)

const extractDomain = (url: string) => {
  try { return new URL(url).hostname }
  catch { return url }
}

function goBack() {
  navigateTo('/history')
}

const showExportMenu = ref(false)
const showMobileSidebar = ref(false)

// Share functionality
async function copyShareLink() {
  if (scanId.value) {
    const shareUrl = `${window.location.origin}/results/${scanId.value}`
    await navigator.clipboard.writeText(shareUrl)
    toast.add({ title: 'Link copied!', description: 'Share this link to view this scan.', color: 'success' })
    return
  }
  const data = await $fetch<{ scanId: string | null }>(`${apiUrl.value}/current-scan-id`).catch(() => null)
  if (data?.scanId) {
    const shareUrl = `${window.location.origin}/results/${data.scanId}`
    await navigator.clipboard.writeText(shareUrl)
    toast.add({ title: 'Link copied!', description: 'Share this link to view this scan.', color: 'success' })
  }
  else {
    toast.add({ title: 'No scan to share', description: 'Start a scan first to generate a shareable link.', color: 'warning' })
  }
}

const navLinks = computed(() => [
  { label: 'Overview', to: `/results/${scanId.value}`, icon: 'i-heroicons-squares-2x2', color: 'text-white' },
  { label: 'Performance', to: `/results/${scanId.value}/performance`, icon: 'i-heroicons-bolt', color: 'text-green-400' },
  { label: 'Accessibility', to: `/results/${scanId.value}/accessibility`, icon: 'i-heroicons-eye', color: 'text-blue-400' },
  { label: 'Best Practices', to: `/results/${scanId.value}/best-practices`, icon: 'i-heroicons-shield-check', color: 'text-purple-400' },
  { label: 'SEO', to: `/results/${scanId.value}/seo`, icon: 'i-heroicons-magnifying-glass', color: 'text-amber-400' },
])

function isActiveRoute(to: string) {
  return route.path === to || (to.endsWith(`/${scanId.value}`) && route.path === to)
}

// Provide site URL to child pages
provide('siteUrl', displayWebsite)
</script>

<template>
  <div class="min-h-screen bg-[#0d0d0d] text-gray-100">
    <!-- Header -->
    <header class="border-b border-white/5 bg-[#0d0d0d]/80 backdrop-blur-sm sticky top-0 z-50">
      <div class="max-w-[1800px] mx-auto px-3 md:px-6 h-14 flex items-center justify-between">
        <div class="flex items-center gap-2 md:gap-4 min-w-0">
          <NuxtLink to="/" class="flex items-center gap-2 shrink-0">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-white" />
            </div>
            <span class="font-semibold text-lg tracking-tight hidden sm:inline">Unlighthouse</span>
          </NuxtLink>
          <div class="h-5 w-px bg-white/10 hidden md:block" />
          <div v-if="displayWebsite" class="flex items-center gap-2 hidden sm:flex">
            <img
              :src="`https://www.google.com/s2/favicons?domain=${extractDomain(displayWebsite)}&sz=32`"
              :alt="displayWebsite"
              class="w-5 h-5 rounded"
              loading="lazy"
              width="20"
              height="20"
            >
            <a
              :href="displayWebsite"
              target="_blank"
              class="text-sm text-gray-400 hover:text-white transition-colors font-mono truncate max-w-[150px] md:max-w-none"
            >
              {{ displayWebsite }}
            </a>
          </div>
          <span v-if="isHistorical" class="px-2 py-0.5 text-xs rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20 shrink-0">
            Historical
          </span>
        </div>

        <div class="flex items-center gap-2 md:gap-4">
          <UButton variant="ghost" color="neutral" size="sm" @click="goBack">
            <UIcon name="i-heroicons-arrow-left" class="w-4 h-4 md:mr-1" />
            <span class="hidden md:inline">{{ isHistorical ? 'Back to History' : 'Back' }}</span>
          </UButton>

          <div class="h-5 w-px bg-white/10 hidden md:block" />

          <div class="flex items-center gap-1">
            <UButton
              icon="i-heroicons-share"
              variant="ghost"
              color="neutral"
              size="sm"
              aria-label="Copy share link"
              title="Copy share link"
              @click="copyShareLink"
            />

            <template v-if="!isHistorical">
              <UButton
                icon="i-heroicons-arrow-path"
                variant="ghost"
                color="neutral"
                size="sm"
                :disabled="isStatic || isOffline"
                aria-label="Rescan all routes"
                title="Rescan All"
                @click="rescanSite"
              />
              <UButton
                icon="i-heroicons-cog-6-tooth"
                variant="ghost"
                color="neutral"
                size="sm"
                aria-label="Open debug panel"
                title="Debug"
                @click="openDebugModal"
              />
              <NuxtLink to="/history" class="ml-2">
                <UButton icon="i-heroicons-clock" variant="ghost" color="neutral" size="sm" aria-label="Go to scan history" title="History" />
              </NuxtLink>
            </template>
          </div>
        </div>
      </div>
    </header>

    <div class="max-w-[1800px] mx-auto flex relative">
      <!-- Mobile sidebar toggle -->
      <button
        class="lg:hidden fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-amber-500 text-white flex items-center justify-center shadow-lg"
        :aria-label="showMobileSidebar ? 'Close section navigation' : 'Open section navigation'"
        @click="showMobileSidebar = !showMobileSidebar"
      >
        <UIcon :name="showMobileSidebar ? 'i-heroicons-x-mark' : 'i-heroicons-bars-3'" class="w-6 h-6" />
      </button>

      <!-- Mobile sidebar overlay -->
      <div
        v-if="showMobileSidebar"
        class="lg:hidden fixed inset-0 bg-black/50 z-40"
        @click="showMobileSidebar = false"
      />

      <!-- Sidebar -->
      <aside
        class="w-56 shrink-0 border-r border-white/5 min-h-[calc(100vh-56px)] p-4 bg-[#0d0d0d]"
        :class="showMobileSidebar ? 'fixed inset-y-14 left-0 z-50' : 'hidden lg:block'"
      >
        <nav class="space-y-1">
          <NuxtLink
            v-for="link in navLinks"
            :key="link.to"
            :to="link.to"
            class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all"
            :class="isActiveRoute(link.to)
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'"
          >
            <UIcon :name="link.icon" class="w-4 h-4" :class="isActiveRoute(link.to) ? link.color : ''" />
            <span>{{ link.label }}</span>
          </NuxtLink>
        </nav>

        <div class="mt-8 pt-8 border-t border-white/5">
          <div class="text-xs text-gray-500 mb-3 uppercase tracking-wider">Info</div>
          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Device</span>
              <span class="font-mono capitalize">{{ displayDevice }}</span>
            </div>
          </div>
        </div>

        <div class="absolute bottom-4 left-4 right-4 w-48">
          <div class="text-xs text-gray-600">
            <a href="https://unlighthouse.dev" target="_blank" class="hover:text-gray-400 transition-colors">Docs</a>
            <span class="mx-2">·</span>
            <a href="https://github.com/harlan-zw/unlighthouse" target="_blank" class="hover:text-gray-400 transition-colors">GitHub</a>
          </div>
        </div>
      </aside>

      <!-- Main Content -->
      <main class="flex-1 p-3 md:p-6">
        <NuxtPage />
      </main>
    </div>

    <!-- Debug Modal -->
    <UModal v-model:open="isDebugModalOpen" title="Debug">
      <template #body>
        <div class="space-y-4 p-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="text-gray-400">Scan ID</div>
            <div class="font-mono">{{ scanId }}</div>
            <div class="text-gray-400">Device</div>
            <div class="font-mono capitalize">{{ displayDevice }}</div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
