<script setup lang="ts">
import Fuse from 'fuse.js'
import { useResultsSearch } from '~/composables/search'
import { useHistoricalScan } from '~/composables/useHistoricalScan'
import { useLighthouseReportModal } from '~/composables/useLighthouseReportModal'
import { useReports } from '~/composables/useReports'
import { useUnlighthouseConfig } from '~/composables/useUnlighthouseConfig'

const { isStatic, resolveArtifactPath } = useUnlighthouseConfig()
const { reports: liveReports } = useReports()
const { page, perPage, searchText } = useResultsSearch()
const {
  isOpen: lighthouseReportModalOpen,
  url: iframeModalUrl,
  devices: modalDevices,
  activeDevice: modalActiveDevice,
  open: openLighthouseReportIframeModal,
  openGroup: openLighthouseReportGroupModal,
  setActiveDevice: setModalDevice,
} = useLighthouseReportModal()

// `device` is set per report row. The modal's device tabs only render when
// both forms are present for the same group (route.path).
const modalDeviceItems = computed(() => {
  const items: { label: string, value: 'mobile' | 'desktop' }[] = []
  if (modalDevices.value.mobile)
    items.push({ label: 'Mobile', value: 'mobile' })
  if (modalDevices.value.desktop)
    items.push({ label: 'Desktop', value: 'desktop' })
  return items
})
const modalDeviceTabValue = computed({
  get: () => modalActiveDevice.value ?? 'mobile',
  set: (v: 'mobile' | 'desktop') => setModalDevice(v),
})

definePageMeta({ layout: 'site' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string | undefined)
const { data: historicalScan } = useHistoricalScan(scanId)
const isHistorical = computed(() => !!scanId.value && !!historicalScan.value)

// Sort & filter state
const sortBy = ref<'score' | 'performance' | 'accessibility' | 'best-practices' | 'seo' | 'path'>('path')
const sortDir = ref<'asc' | 'desc'>('asc')
const quickFilter = ref<'all' | 'worst5' | 'best5' | 'below50'>('all')

const reports = computed(() => {
  if (isHistorical.value && historicalScan.value?.routes) {
    return historicalScan.value.routes.map((r) => {
      const cats = {
        'performance': r.scorePerformance,
        'accessibility': r.scoreAccessibility,
        'best-practices': r.scoreBestPractices,
        'seo': r.scoreSeo,
      }
      const present = Object.values(cats).filter((s): s is number => s != null)
      const overall = present.length ? present.reduce((a, b) => a + b, 0) / present.length : null
      return {
        route: { path: r.path, url: r.url, id: r.path },
        device: r.device,
        // artifactUrl omitted; openLighthouseReportIframeModal falls back to apiUrl/reports/:path
        report: overall != null
          ? {
              score: overall,
              categories: {
                'performance': { score: r.scorePerformance ?? 0, title: 'Performance' },
                'accessibility': { score: r.scoreAccessibility ?? 0, title: 'Accessibility' },
                'best-practices': { score: r.scoreBestPractices ?? 0, title: 'Best Practices' },
                'seo': { score: r.scoreSeo ?? 0, title: 'SEO' },
              },
            }
          : null,
      }
    })
  }
  return liveReports.value
})

// Calculate overall score from category scores
function getOverallScore(r: any): number | null {
  if (!r.report?.categories)
    return null
  const cats = Object.values(r.report.categories) as { score: number }[]
  const scores = cats.map(c => c.score * 100).filter(s => !Number.isNaN(s))
  if (!scores.length)
    return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
}

function getCategoryScore(r: any, cat: string): number | null {
  const score = r.report?.categories?.[cat]?.score
  return score != null ? Math.round(score * 100) : null
}

// D-029: matrix scans emit one report per (url, device). Group by route.path
// so the UI shows one row per route with side-by-side device scores when
// both forms ran. Single-device scans degrade to the original single-row
// layout because group.mobile or group.desktop is undefined.
interface RouteGroup {
  path: string
  url?: string
  mobile?: any
  desktop?: any
  // The "primary" report used for sort / filter / screenshot — mobile when
  // available (canonical Lighthouse default), otherwise desktop, otherwise
  // whatever single-device report exists.
  primary: any
  devices: ('mobile' | 'desktop')[]
}

function groupReports(rows: any[]): RouteGroup[] {
  const byPath = new Map<string, RouteGroup>()
  for (const r of rows) {
    const path = r.route?.path ?? '/'
    let g = byPath.get(path)
    if (!g) {
      g = { path, url: r.route?.url, primary: r, devices: [] }
      byPath.set(path, g)
    }
    const device = r.device as 'mobile' | 'desktop' | undefined
    if (device === 'mobile') {
      g.mobile = r
      if (!g.devices.includes('mobile'))
        g.devices.push('mobile')
    }
    else if (device === 'desktop') {
      g.desktop = r
      if (!g.devices.includes('desktop'))
        g.devices.push('desktop')
    }
    // Pick canonical primary: prefer mobile, then desktop, else first seen.
    g.primary = g.mobile ?? g.desktop ?? g.primary
    g.url ??= r.route?.url
  }
  return [...byPath.values()]
}

// Summary stats — average the primary device's score per group so multi-device
// matrix scans don't double-count the same logical route.
function avgScoreByCategory(cat: string) {
  const data = groupReports(reports.value || [])
  const scores = data
    .map(g => g.primary?.report?.categories?.[cat]?.score)
    .filter((s: any) => s != null) as number[]
  if (!scores.length)
    return null
  return Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100)
}

const overallAvgScore = computed(() => {
  const perf = avgScoreByCategory('performance')
  const a11y = avgScoreByCategory('accessibility')
  const bp = avgScoreByCategory('best-practices')
  const seo = avgScoreByCategory('seo')
  const scores = [perf, a11y, bp, seo].filter(s => s !== null) as number[]
  if (!scores.length)
    return null
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
})

const summaryStats = computed(() => {
  const data = groupReports(reports.value || [])
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

// Fuzzy search + sort + filter — operates on grouped rows so paginate/sort
// reflect logical routes, not (route, device) pairs.
const searchResults = computed((): RouteGroup[] => {
  let data: RouteGroup[] = groupReports(reports.value || [])

  // Fuzzy search across path / url at the group level.
  if (searchText.value && data.length) {
    const fuse = new Fuse(data, {
      threshold: 0.4,
      keys: ['path', 'url'],
    })
    data = fuse.search(searchText.value).map(i => i.item)
  }

  // Quick filter: scores come from the primary report (mobile when present).
  if (quickFilter.value !== 'all') {
    const scored = data.filter(g => getOverallScore(g.primary) !== null)
    if (quickFilter.value === 'worst5') {
      data = [...scored].sort((a, b) => (getOverallScore(a.primary) ?? 0) - (getOverallScore(b.primary) ?? 0)).slice(0, 5)
    }
    else if (quickFilter.value === 'best5') {
      data = [...scored].sort((a, b) => (getOverallScore(b.primary) ?? 0) - (getOverallScore(a.primary) ?? 0)).slice(0, 5)
    }
    else if (quickFilter.value === 'below50') {
      data = scored.filter(g => (getOverallScore(g.primary) ?? 100) < 50)
    }
  }

  // Sort by group key — same comparators as before, just reading from primary.
  if (sortBy.value === 'path') {
    data = [...data].sort((a, b) => {
      const cmp = (a.path || '').localeCompare(b.path || '')
      return sortDir.value === 'asc' ? cmp : -cmp
    })
  }
  else if (sortBy.value === 'score') {
    data = [...data].sort((a, b) => {
      const diff = (getOverallScore(a.primary) ?? -1) - (getOverallScore(b.primary) ?? -1)
      return sortDir.value === 'asc' ? diff : -diff
    })
  }
  else {
    data = [...data].sort((a, b) => {
      const diff = (getCategoryScore(a.primary, sortBy.value) ?? -1) - (getCategoryScore(b.primary, sortBy.value) ?? -1)
      return sortDir.value === 'asc' ? diff : -diff
    })
  }

  return data
})

const paginatedResults = computed((): RouteGroup[] => {
  const offset = (page.value - 1) * perPage
  return searchResults.value.slice(offset, offset + perPage)
})

function openRouteModal(group: RouteGroup, preferred?: 'mobile' | 'desktop') {
  if (group.mobile && group.desktop) {
    openLighthouseReportGroupModal({ mobile: group.mobile, desktop: group.desktop }, preferred)
  }
  else {
    openLighthouseReportIframeModal(group.primary)
  }
}

const categoryAbbrev: Record<string, string> = {
  'Performance': 'Perf',
  'Accessibility': 'A11y',
  'Best Practices': 'Best',
  'SEO': 'SEO',
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

</script>

<template>
  <div>
    <DashboardHeader
      title="Overview"
      icon="i-heroicons-view-columns"
      color="text-primary"
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
        :ui="{ base: 'bg-elevated/60 border-default focus-visible:border-accented focus-visible:ring-accented' }"
        class="w-64"
      />

      <div class="flex items-center gap-2">
        <span class="text-xs text-dimmed">Sort:</span>
        <USelectMenu
          v-model="sortBy"
          :items="sortOptions"
          value-key="value"
          size="xs"
          class="w-32"
        />
        <UiMotionButton
          variant="ghost"
          size="xs"
          :icon="sortDir === 'asc' ? 'i-heroicons-arrow-up' : 'i-heroicons-arrow-down'"
          @click="sortDir = sortDir === 'asc' ? 'desc' : 'asc'"
        />
      </div>

      <div class="flex items-center gap-2">
        <span class="text-xs text-dimmed">Filter:</span>
        <UiPillSelect v-model="quickFilter" :options="filterOptions" />
      </div>
    </div>

    <!-- Loading skeletons -->
    <div v-if="reports.length === 0 && !searchText" class="grid gap-3">
      <SkeletonCard v-for="i in 5" :key="i" />
    </div>

    <!-- Empty state -->
    <div v-else-if="paginatedResults.length === 0" class="flex flex-col items-center justify-center py-20">
      <UIcon name="i-heroicons-magnifying-glass" class="size-8 text-dimmed mb-4" />
      <p class="text-dimmed">
        No routes match this filter
      </p>
    </div>

    <!-- Results -->
    <div v-else class="grid gap-3">
      <div
        v-for="g in paginatedResults"
        :key="g.path"
        class="group bg-elevated/40 hover:bg-elevated/80 border border-default hover:border-accented rounded-sm p-4 transition-colors cursor-pointer"
        @click="openRouteModal(g)"
      >
        <div class="flex items-center gap-3 md:gap-4">
          <!-- Screenshot (from primary report) -->
          <div class="w-16 h-12 md:w-24 md:h-16 rounded-sm overflow-hidden bg-elevated/60 shrink-0 hidden sm:block">
            <img
              v-if="g.primary?.report && g.primary?.artifactUrl"
              :src="resolveArtifactPath(g.primary, 'screenshot.jpeg')"
              class="w-full h-full object-cover object-top"
              loading="lazy"
            >
            <div v-else-if="g.primary?.report" class="w-full h-full flex items-center justify-center">
              <UIcon name="i-heroicons-photo" class="w-5 h-5 text-dimmed" />
            </div>
            <USkeleton v-else class="w-full h-full rounded-none" />
          </div>

          <!-- Route Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <span class="font-mono text-xs sm:text-sm text-highlighted truncate">{{ g.path || '/' }}</span>
              <!-- Device pills appear only when both forms are present. -->
              <span
                v-if="g.mobile && g.desktop"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] bg-elevated/60 text-dimmed border border-default"
                :title="`Mobile + Desktop coverage`"
              >
                <UIcon name="i-heroicons-device-phone-mobile" class="size-3" />
                <UIcon name="i-heroicons-computer-desktop" class="size-3" />
              </span>
              <!-- Single-device pill when only one ran (only useful in matrix
                   scans where some routes failed on one device). -->
              <span
                v-else-if="g.mobile || g.desktop"
                class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[10px] bg-elevated/60 text-dimmed border border-default"
              >
                <UIcon :name="g.mobile ? 'i-heroicons-device-phone-mobile' : 'i-heroicons-computer-desktop'" class="size-3" />
                {{ g.mobile ? 'Mobile' : 'Desktop' }}
              </span>
            </div>
            <div class="text-xs text-dimmed truncate hidden sm:block">
              {{ g.url }}
            </div>
          </div>

          <!-- Scores: side-by-side mobile + desktop when both present,
               otherwise the single device's flat row (back-compat). -->
          <div v-if="g.mobile?.report?.categories && g.desktop?.report?.categories" class="flex items-stretch gap-4">
            <div
              v-for="dev in (['mobile', 'desktop'] as const)"
              :key="dev"
              class="flex flex-col items-center gap-1"
            >
              <div class="flex items-center gap-1 text-[10px] text-dimmed uppercase tracking-wide">
                <UIcon
                  :name="dev === 'mobile' ? 'i-heroicons-device-phone-mobile' : 'i-heroicons-computer-desktop'"
                  class="size-3"
                />
                {{ dev }}
              </div>
              <div class="flex items-center gap-1.5 sm:gap-2">
                <div
                  v-for="(cat, catKey) in g[dev]!.report.categories"
                  :key="catKey"
                  class="text-center"
                >
                  <div
                    class="w-7 h-7 sm:w-9 sm:h-9 rounded-sm flex items-center justify-center font-mono font-semibold text-xs"
                    :class="[getScoreBg(Math.round((cat as any).score * 100)), getScoreColor(Math.round((cat as any).score * 100))]"
                  >
                    {{ (cat as any).score != null ? Math.round((cat as any).score * 100) : '-' }}
                  </div>
                  <div class="text-[10px] text-dimmed mt-1 hidden lg:block">
                    {{ categoryAbbrev[(cat as any).title] || (cat as any).title }}
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div v-else-if="g.primary?.report?.categories" class="flex items-center gap-1.5 sm:gap-3">
            <div
              v-for="(cat, catKey) in g.primary.report.categories"
              :key="catKey"
              class="text-center"
            >
              <div
                class="w-8 h-8 sm:w-10 sm:h-10 rounded-sm flex items-center justify-center font-mono font-semibold text-xs sm:text-sm"
                :class="[getScoreBg(Math.round((cat as any).score * 100)), getScoreColor(Math.round((cat as any).score * 100))]"
              >
                {{ (cat as any).score != null ? Math.round((cat as any).score * 100) : '-' }}
              </div>
              <div class="text-[10px] text-dimmed mt-1 hidden sm:block">
                {{ categoryAbbrev[(cat as any).title] || (cat as any).title }}
              </div>
            </div>
          </div>

          <div v-else class="flex items-center gap-2 text-dimmed">
            <USkeleton class="size-2 rounded-full" />
            <span class="text-sm">Scanning</span>
          </div>

          <!-- View Report Button -->
          <UiMotionButton
            v-if="g.primary?.report"
            variant="ghost"
            size="xs"
            icon="i-heroicons-document-magnifying-glass"
            class="opacity-60 group-hover:opacity-100 transition-opacity shrink-0"
            @click.stop="openRouteModal(g)"
          >
            <span class="hidden md:inline">View report</span>
          </UiMotionButton>
        </div>
      </div>
    </div>

    <!-- Pagination -->
    <div v-if="searchResults.length > perPage" class="mt-6 flex items-center justify-between">
      <div class="text-sm text-dimmed">
        {{ searchResults.length }} routes
      </div>
      <UPagination
        v-model:page="page"
        :items-per-page="perPage"
        :total="searchResults.length"
      />
    </div>

    <!-- Lighthouse Report Modal — device tabs render only when both forms are
         present, falling back to the bare iframe for single-device scans. -->
    <UModal v-model:open="lighthouseReportModalOpen" title="Lighthouse report" :ui="{ content: '!max-w-6xl !bg-default' }">
      <template #body>
        <div v-if="modalDeviceItems.length > 1" class="mb-3">
          <UTabs
            v-model="modalDeviceTabValue"
            :items="modalDeviceItems"
            size="xs"
            :ui="{ list: 'w-fit' }"
          />
        </div>
        <iframe v-if="iframeModalUrl" :src="iframeModalUrl" class="w-full h-[80vh] bg-white rounded-sm" />
      </template>
    </UModal>
  </div>
</template>
