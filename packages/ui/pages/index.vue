<script setup lang="ts">
import { rescanSite } from '~/composables/actions'
import { page, paginatedResults, perPage, searchResults, searchText } from '~/composables/search'
import {
  iframeModalUrl,
  isDebugModalOpen,
  isOffline,
  lighthouseReportModalOpen,
  openDebugModal,
  openLighthouseReportIframeModal,
  refreshScanMeta,
  unlighthouseReports as reports,
  scanMeta,
  wsConnect,
} from '~/composables/state'
import { apiUrl, basePath, device, dynamicSampling, isStatic, resolveArtifactPath, throttle, website } from '~/composables/unlighthouse'

const activeCategory = ref<'overview' | 'performance' | 'accessibility' | 'best-practices' | 'seo'>('overview')

const categoryAbbrev: Record<string, string> = {
  'Performance': 'Perf',
  'Accessibility': 'A11y',
  'Best Practices': 'BP',
  'SEO': 'SEO',
}

const categoryConfig = {
  'overview': { label: 'Overview', icon: 'i-heroicons-squares-2x2', color: 'text-white' },
  'performance': { label: 'Performance', icon: 'i-heroicons-bolt', color: 'text-green-400' },
  'accessibility': { label: 'Accessibility', icon: 'i-heroicons-eye', color: 'text-blue-400' },
  'best-practices': { label: 'Best Practices', icon: 'i-heroicons-shield-check', color: 'text-purple-400' },
  'seo': { label: 'SEO', icon: 'i-heroicons-magnifying-glass', color: 'text-amber-400' },
}

let refreshInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (isStatic.value)
    return
  wsConnect().catch(console.warn)
  refreshInterval = setInterval(refreshScanMeta, 5000)
})

onUnmounted(() => {
  if (refreshInterval)
    clearInterval(refreshInterval)
})

const scanProgress = computed(() => {
  const total = scanMeta.value?.routes || 0
  const done = reports.value.filter((r: any) => r.report).length
  return total > 0 ? Math.round((done / total) * 100) : 0
})

const isScanning = computed(() => scanProgress.value < 100 && scanProgress.value > 0)

const avgScore = computed(() => {
  const withReports = reports.value.filter((r: any) => r.report?.categories)
  if (!withReports.length)
    return null
  const sum = withReports.reduce((acc: number, r: any) => {
    const cats = Object.values(r.report.categories) as any[]
    const avg = cats.reduce((a: number, c: any) => a + (c.score || 0), 0) / cats.length
    return acc + avg
  }, 0)
  return Math.round((sum / withReports.length) * 100)
})

function getScoreColor(score: number | null) {
  if (score === null)
    return 'text-gray-500'
  if (score >= 90)
    return 'text-green-400'
  if (score >= 50)
    return 'text-amber-400'
  return 'text-red-400'
}

function getScoreBg(score: number | null) {
  if (score === null)
    return 'bg-gray-500/10'
  if (score >= 90)
    return 'bg-green-500/10'
  if (score >= 50)
    return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

function getCategoryScore(report: any, category: string) {
  const cat = report?.report?.categories?.[category]
  return cat?.score != null ? Math.round(cat.score * 100) : null
}
</script>

<template>
  <div class="min-h-screen bg-[#0d0d0d] text-gray-100">
    <!-- Header -->
    <header class="border-b border-white/5 bg-[#0d0d0d]/80 backdrop-blur-sm sticky top-0 z-50">
      <div class="max-w-[1800px] mx-auto px-6 h-14 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-white" />
            </div>
            <span class="font-semibold text-lg tracking-tight">Unlighthouse</span>
          </div>
          <div class="h-5 w-px bg-white/10" />
          <a
            v-if="website"
            :href="website"
            target="_blank"
            class="text-sm text-gray-400 hover:text-white transition-colors font-mono"
          >
            {{ website }}
          </a>
        </div>

        <div class="flex items-center gap-4">
          <!-- Scan Status -->
          <div v-if="isScanning" class="flex items-center gap-3 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
            <div class="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
            <span class="text-sm text-gray-300">Scanning...</span>
            <span class="text-sm font-mono text-amber-400">{{ scanProgress }}%</span>
          </div>
          <div v-else-if="scanProgress === 100" class="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
            <UIcon name="i-heroicons-check-circle" class="w-4 h-4 text-green-400" />
            <span class="text-sm text-green-400">Complete</span>
          </div>

          <!-- Avg Score -->
          <div
            v-if="avgScore !== null"
            class="flex items-center gap-2 px-3 py-1.5 rounded-full border"
            :class="[getScoreBg(avgScore), avgScore >= 90 ? 'border-green-500/20' : avgScore >= 50 ? 'border-amber-500/20' : 'border-red-500/20']"
          >
            <span class="text-sm text-gray-400">Avg</span>
            <span class="font-mono font-semibold" :class="getScoreColor(avgScore)">{{ avgScore }}</span>
          </div>

          <div class="h-5 w-px bg-white/10" />

          <div class="flex items-center gap-1">
            <UButton
              icon="i-heroicons-arrow-path"
              variant="ghost"
              color="neutral"
              size="sm"
              :disabled="isStatic || isOffline"
              title="Rescan All"
              @click="rescanSite"
            />
            <UButton
              icon="i-heroicons-cog-6-tooth"
              variant="ghost"
              color="neutral"
              size="sm"
              @click="openDebugModal"
            />
          </div>
        </div>
      </div>
    </header>

    <div class="max-w-[1800px] mx-auto flex">
      <!-- Sidebar -->
      <aside class="w-56 shrink-0 border-r border-white/5 min-h-[calc(100vh-56px)] p-4">
        <nav class="space-y-1">
          <button
            v-for="(config, key) in categoryConfig"
            :key="key"
            class="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all"
            :class="activeCategory === key
              ? 'bg-white/10 text-white'
              : 'text-gray-400 hover:text-white hover:bg-white/5'"
            @click="activeCategory = key as any"
          >
            <UIcon :name="config.icon" class="w-4 h-4" :class="activeCategory === key ? config.color : ''" />
            <span>{{ config.label }}</span>
          </button>
        </nav>

        <div class="mt-8 pt-8 border-t border-white/5">
          <div class="text-xs text-gray-500 mb-3 uppercase tracking-wider">
            Stats
          </div>
          <div class="space-y-3">
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Routes</span>
              <span class="font-mono">{{ reports.length }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Scanned</span>
              <span class="font-mono">{{ reports.filter((r: any) => r.report).length }}</span>
            </div>
            <div class="flex justify-between text-sm">
              <span class="text-gray-400">Device</span>
              <span class="font-mono capitalize">{{ device }}</span>
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
      <main class="flex-1 p-6">
        <!-- Search -->
        <div class="mb-6">
          <UInput
            v-model="searchText"
            icon="i-heroicons-magnifying-glass"
            placeholder="Search routes..."
            size="lg"
            :ui="{ base: 'bg-white/5 border-white/10 focus:border-amber-500/50 focus:ring-amber-500/20' }"
            class="max-w-md"
          />
        </div>

        <!-- Routes Grid -->
        <div v-if="paginatedResults.length === 0" class="flex flex-col items-center justify-center py-20">
          <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 text-gray-600 mb-4" />
          <p class="text-gray-500">
            No routes found
          </p>
        </div>

        <div v-else class="grid gap-3">
          <div
            v-for="report in paginatedResults"
            :key="report.route?.path"
            class="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all cursor-pointer"
            @click="openLighthouseReportIframeModal(report)"
          >
            <div class="flex items-center gap-4">
              <!-- Screenshot -->
              <div class="w-24 h-16 rounded-lg overflow-hidden bg-white/5 shrink-0">
                <img
                  v-if="report.report"
                  :src="resolveArtifactPath(report, 'screenshot.jpeg')"
                  class="w-full h-full object-cover object-top"
                  loading="lazy"
                >
                <div v-else class="w-full h-full flex items-center justify-center">
                  <UIcon name="i-svg-spinners-90-ring-with-bg" class="w-5 h-5 text-gray-600" />
                </div>
              </div>

              <!-- Route Info -->
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span class="font-mono text-sm text-white truncate">{{ report.route?.path || '/' }}</span>
                  <UIcon
                    v-if="report.report"
                    name="i-heroicons-arrow-top-right-on-square"
                    class="w-3 h-3 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </div>
                <div class="text-xs text-gray-500 truncate">
                  {{ report.route?.url }}
                </div>
              </div>

              <!-- Scores -->
              <div v-if="report.report?.categories" class="flex items-center gap-3">
                <div
                  v-for="(cat, catKey) in report.report.categories"
                  :key="catKey"
                  class="text-center"
                >
                  <div
                    class="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-semibold text-sm"
                    :class="[getScoreBg(Math.round((cat as any).score * 100)), getScoreColor(Math.round((cat as any).score * 100))]"
                  >
                    {{ (cat as any).score != null ? Math.round((cat as any).score * 100) : '-' }}
                  </div>
                  <div class="text-[10px] text-gray-500 mt-1">
                    {{ categoryAbbrev[(cat as any).title] || (cat as any).title }}
                  </div>
                </div>
              </div>

              <div v-else class="flex items-center gap-2 text-gray-500">
                <UIcon name="i-svg-spinners-90-ring-with-bg" class="w-4 h-4" />
                <span class="text-sm">Scanning</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Pagination -->
        <div v-if="searchResults.length > perPage" class="mt-6 flex items-center justify-between">
          <div class="text-sm text-gray-500">
            {{ searchResults.length }} routes
          </div>
          <UPagination
            v-model:page="page"
            :items-per-page="perPage"
            :total="searchResults.length"
          />
        </div>
      </main>
    </div>

    <!-- Modals -->
    <UModal v-model:open="lighthouseReportModalOpen" title="Lighthouse Report" :ui="{ content: '!max-w-6xl !bg-[#0d0d0d]' }">
      <template #body>
        <iframe v-if="iframeModalUrl" :src="iframeModalUrl" class="w-full h-[85vh] bg-white rounded-lg" />
      </template>
    </UModal>

    <UModal v-model:open="isDebugModalOpen" title="Debug">
      <template #body>
        <div class="space-y-4 p-4">
          <div class="grid grid-cols-2 gap-4 text-sm">
            <div class="text-gray-400">
              API URL
            </div>
            <div class="font-mono">
              {{ apiUrl }}
            </div>
            <div class="text-gray-400">
              Base Path
            </div>
            <div class="font-mono">
              {{ basePath }}
            </div>
            <div class="text-gray-400">
              Device
            </div>
            <div class="font-mono capitalize">
              {{ device }}
            </div>
            <div class="text-gray-400">
              Throttle
            </div>
            <div class="font-mono">
              {{ throttle }}
            </div>
            <div class="text-gray-400">
              Dynamic Sampling
            </div>
            <div class="font-mono">
              {{ dynamicSampling }}
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
