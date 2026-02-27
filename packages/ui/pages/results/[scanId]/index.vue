<script setup lang="ts">
import Fuse from 'fuse.js'
import {
  lighthouseReportModalOpen,
  iframeModalUrl,
  unlighthouseReports as liveReports,
  wsConnect,
  refreshScanMeta,
  openLighthouseReportIframeModal,
} from '~/composables/state'
import { searchText, page, perPage } from '~/composables/search'
import { isStatic, resolveArtifactPath, apiUrl } from '~/composables/unlighthouse'
import { getScoreColor, getScoreBg } from '~/composables/dashboard'

definePageMeta({ layout: 'results' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string | undefined)
const historicalScan = ref<{ site: string, device: string, routes: any[] } | null>(null)
const isHistorical = computed(() => !!scanId.value && !!historicalScan.value)

// Sort & filter state
const sortBy = ref<'score' | 'performance' | 'accessibility' | 'best-practices' | 'seo' | 'path'>('path')
const sortDir = ref<'asc' | 'desc'>('asc')
const quickFilter = ref<'all' | 'worst5' | 'best5' | 'below50'>('all')

const reports = computed(() => {
  if (isHistorical.value && historicalScan.value?.routes) {
    return historicalScan.value.routes.map(r => ({
      route: { path: r.path, url: r.url, id: r.path },
      artifactUrl: r.artifactUrl,
      report: r.score != null
        ? {
            score: r.score,
            categories: {
              performance: { score: (r.performanceScore || 0) / 100, title: 'Performance' },
              accessibility: { score: (r.accessibilityScore || 0) / 100, title: 'Accessibility' },
              'best-practices': { score: (r.bestPracticesScore || 0) / 100, title: 'Best Practices' },
              seo: { score: (r.seoScore || 0) / 100, title: 'SEO' },
            },
          }
        : null,
    }))
  }
  return liveReports.value
})

watch(scanId, async (id) => {
  if (!id) {
    historicalScan.value = null
    return
  }
  const data = await $fetch<any>(`${apiUrl.value}/history/${id}`).catch(() => null)
  historicalScan.value = data
}, { immediate: true })

// Calculate overall score from category scores
const getOverallScore = (r: any): number | null => {
  if (!r.report?.categories) return null
  const cats = Object.values(r.report.categories) as { score: number }[]
  const scores = cats.map(c => c.score * 100).filter(s => !Number.isNaN(s))
  if (!scores.length) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

const getCategoryScore = (r: any, cat: string): number | null => {
  const score = r.report?.categories?.[cat]?.score
  return score != null ? Math.round(score * 100) : null
}

// Summary stats
const avgScoreByCategory = (cat: string) => {
  const data = reports.value || []
  const scores = data.map((r: any) => r.report?.categories?.[cat]?.score).filter((s: any) => s != null)
  if (!scores.length) return null
  return Math.round((scores.reduce((a: number, b: number) => a + b, 0) / scores.length) * 100)
}

const overallAvgScore = computed(() => {
  const perf = avgScoreByCategory('performance')
  const a11y = avgScoreByCategory('accessibility')
  const bp = avgScoreByCategory('best-practices')
  const seo = avgScoreByCategory('seo')
  const scores = [perf, a11y, bp, seo].filter(s => s !== null) as number[]
  if (!scores.length) return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
})

const summaryStats = computed(() => {
  const data = reports.value || []
  const perf = avgScoreByCategory('performance')
  const a11y = avgScoreByCategory('accessibility')
  const bp = avgScoreByCategory('best-practices')
  const seo = avgScoreByCategory('seo')

  return [
    { label: 'Pages', value: data.length, icon: 'i-heroicons-document-text' },
    { label: 'Performance', value: perf ?? '-', color: getScoreColor(perf), icon: 'i-heroicons-bolt' },
    { label: 'Accessibility', value: a11y ?? '-', color: getScoreColor(a11y), icon: 'i-heroicons-eye' },
    { label: 'Best Practices', value: bp ?? '-', color: getScoreColor(bp), icon: 'i-heroicons-shield-check' },
    { label: 'SEO', value: seo ?? '-', color: getScoreColor(seo), icon: 'i-heroicons-magnifying-glass' },
  ]
})


// Fuzzy search + sort + filter
const searchResults = computed((): any[] => {
  let data: any[] = reports.value || []

  // Fuzzy search
  if (searchText.value && data.length) {
    const fuse = new Fuse(data, {
      threshold: 0.4,
      keys: ['route.path', 'route.url'],
    })
    data = fuse.search(searchText.value).map(i => i.item)
  }

  // Quick filter
  if (quickFilter.value !== 'all') {
    const scored = data.filter((r: any) => getOverallScore(r) !== null)
    if (quickFilter.value === 'worst5') {
      data = [...scored].sort((a, b) => (getOverallScore(a) ?? 0) - (getOverallScore(b) ?? 0)).slice(0, 5)
    }
    else if (quickFilter.value === 'best5') {
      data = [...scored].sort((a, b) => (getOverallScore(b) ?? 0) - (getOverallScore(a) ?? 0)).slice(0, 5)
    }
    else if (quickFilter.value === 'below50') {
      data = scored.filter((r: any) => (getOverallScore(r) ?? 100) < 50)
    }
  }

  // Sort
  if (sortBy.value === 'path') {
    data = [...data].sort((a, b) => {
      const cmp = (a.route?.path || '').localeCompare(b.route?.path || '')
      return sortDir.value === 'asc' ? cmp : -cmp
    })
  }
  else if (sortBy.value === 'score') {
    data = [...data].sort((a, b) => {
      const diff = (getOverallScore(a) ?? -1) - (getOverallScore(b) ?? -1)
      return sortDir.value === 'asc' ? diff : -diff
    })
  }
  else {
    data = [...data].sort((a, b) => {
      const diff = (getCategoryScore(a, sortBy.value) ?? -1) - (getCategoryScore(b, sortBy.value) ?? -1)
      return sortDir.value === 'asc' ? diff : -diff
    })
  }

  return data
})

const paginatedResults = computed((): any[] => {
  const offset = (page.value - 1) * perPage
  return searchResults.value.slice(offset, offset + perPage)
})

const categoryAbbrev: Record<string, string> = {
  Performance: 'Perf',
  Accessibility: 'A11y',
  'Best Practices': 'Best',
  SEO: 'SEO',
}

const sortOptions = [
  { label: 'Path', value: 'path' },
  { label: 'Overall Score', value: 'score' },
  { label: 'Performance', value: 'performance' },
  { label: 'Accessibility', value: 'accessibility' },
  { label: 'Best Practices', value: 'best-practices' },
  { label: 'SEO', value: 'seo' },
]

const filterOptions = [
  { label: 'All', value: 'all' },
  { label: 'Worst 5', value: 'worst5' },
  { label: 'Best 5', value: 'best5' },
  { label: 'Below 50', value: 'below50' },
]

let refreshInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (isStatic.value || scanId.value) return
  wsConnect().catch(console.warn)
  refreshInterval = setInterval(refreshScanMeta, 5000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})
</script>

<template>
  <div>
    <DashboardHeader
      title="Overview"
      icon="i-heroicons-view-columns"
      color="text-amber-400"
      :score="overallAvgScore"
      :stats="summaryStats"
    />

    <!-- Search + Sort/Filter Controls -->
    <div class="flex flex-wrap items-center gap-3 mb-6">
      <UInput
        v-model="searchText"
        icon="i-heroicons-magnifying-glass"
        placeholder="Search routes..."
        size="sm"
        :ui="{ base: 'bg-white/5 border-white/10 focus:border-amber-500/50 focus:ring-amber-500/20' }"
        class="w-64"
      />

      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">Sort:</span>
        <USelectMenu
          v-model="sortBy"
          :items="sortOptions"
          value-key="value"
          size="xs"
          class="w-32"
        />
        <UButton
          variant="ghost"
          size="xs"
          :icon="sortDir === 'asc' ? 'i-heroicons-arrow-up' : 'i-heroicons-arrow-down'"
          @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
        />
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs text-gray-500">Filter:</span>
        <USelectMenu
          v-model="quickFilter"
          :items="filterOptions"
          value-key="value"
          size="xs"
          class="w-28"
        />
      </div>
    </div>

    <!-- Loading skeletons -->
    <div v-if="reports.length === 0 && !searchText" class="grid gap-3">
      <SkeletonCard v-for="i in 5" :key="i" />
    </div>

    <!-- Empty state -->
    <div v-else-if="paginatedResults.length === 0" class="flex flex-col items-center justify-center py-20">
      <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 text-gray-600 mb-4" />
      <p class="text-gray-500">No routes found</p>
    </div>

    <!-- Results -->
    <div v-else class="grid gap-3">
      <div
        v-for="report in paginatedResults"
        :key="report.route?.path"
        class="group bg-white/[0.02] hover:bg-white/[0.04] border border-white/5 hover:border-white/10 rounded-xl p-4 transition-all cursor-pointer"
        @click="openLighthouseReportIframeModal(report)"
      >
        <div class="flex items-center gap-3 md:gap-4">
          <!-- Screenshot -->
          <div class="w-16 h-12 md:w-24 md:h-16 rounded-lg overflow-hidden bg-white/5 shrink-0 hidden sm:block">
            <img
              v-if="report.report && report.artifactUrl"
              :src="resolveArtifactPath(report, 'screenshot.jpeg')"
              class="w-full h-full object-cover object-top"
              loading="lazy"
            >
            <div v-else-if="report.report" class="w-full h-full flex items-center justify-center">
              <UIcon name="i-heroicons-photo" class="w-5 h-5 text-gray-600" />
            </div>
            <div v-else class="w-full h-full flex items-center justify-center">
              <UIcon name="i-svg-spinners-90-ring-with-bg" class="w-5 h-5 text-gray-600" />
            </div>
          </div>

          <!-- Route Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-mono text-xs sm:text-sm text-white truncate">{{ report.route?.path || '/' }}</span>
            </div>
            <div class="text-xs text-gray-500 truncate hidden sm:block">{{ report.route?.url }}</div>
          </div>

          <!-- Scores -->
          <div v-if="report.report?.categories" class="flex items-center gap-1.5 sm:gap-3">
            <div
              v-for="(cat, catKey) in report.report.categories"
              :key="catKey"
              class="text-center"
            >
              <div
                class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg flex items-center justify-center font-mono font-semibold text-xs sm:text-sm"
                :class="[getScoreBg(Math.round((cat as any).score * 100)), getScoreColor(Math.round((cat as any).score * 100))]"
              >
                {{ (cat as any).score != null ? Math.round((cat as any).score * 100) : '-' }}
              </div>
              <div class="text-[10px] text-gray-500 mt-1 hidden sm:block">{{ categoryAbbrev[(cat as any).title] || (cat as any).title }}</div>
            </div>
          </div>

          <div v-else class="flex items-center gap-2 text-gray-500">
            <UIcon name="i-svg-spinners-90-ring-with-bg" class="w-4 h-4" />
            <span class="text-sm">Scanning</span>
          </div>

          <!-- View Report Button -->
          <UButton
            v-if="report.report"
            variant="ghost"
            size="xs"
            icon="i-heroicons-document-magnifying-glass"
            class="opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
            @click.stop="openLighthouseReportIframeModal(report)"
          >
            <span class="hidden md:inline">View Report</span>
          </UButton>
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

    <!-- Lighthouse Report Modal -->
    <UModal v-model:open="lighthouseReportModalOpen" title="Lighthouse Report" :ui="{ content: '!max-w-6xl !bg-[#0d0d0d]' }">
      <template #body>
        <iframe v-if="iframeModalUrl" :src="iframeModalUrl" class="w-full h-[85vh] bg-white rounded-lg" />
      </template>
    </UModal>
  </div>
</template>
