<script setup lang="ts">
import { apiUrl } from '~/composables/unlighthouse'

interface Scan {
  id: string
  site: string
  device: 'mobile' | 'desktop'
  throttle: boolean
  routeCount: number
  scannedCount: number
  failedCount: number
  avgScore: number | null
  performanceScore: number | null
  accessibilityScore: number | null
  bestPracticesScore: number | null
  seoScore: number | null
  status: 'running' | 'complete' | 'cancelled' | 'failed'
  startedAt: string
  completedAt: string | null
}

const router = useRouter()
const toast = useToast()

const { data, refresh, status } = await useFetch<{ scans: Scan[] }>(`${apiUrl.value}/history`)

// Search and filters
const searchQuery = ref('')
const sortBy = ref<'date' | 'score' | 'routes' | 'perf' | 'a11y' | 'best' | 'seo'>('date')
const sortDir = ref<'asc' | 'desc'>('desc')
const minScore = ref<number | null>(null)
const dateRange = ref<number | null>(null)
const showFilters = ref(false)
const groupBy = ref<'none' | 'site'>('site')

const sortOptions = [
  { label: 'Date', value: 'date' },
  { label: 'Avg', value: 'score' },
  { label: 'Perf', value: 'perf' },
  { label: 'A11y', value: 'a11y' },
  { label: 'Best', value: 'best' },
  { label: 'SEO', value: 'seo' },
  { label: 'Routes', value: 'routes' },
]

const scoreFilterOptions = [
  { label: 'All', value: null },
  { label: '90+', value: 90 },
  { label: '50+', value: 50 },
  { label: 'Under 50', value: -50 },
]

const dateRangeOptions = [
  { label: 'All time', value: null },
  { label: 'Today', value: 1 },
  { label: '7 days', value: 7 },
  { label: '30 days', value: 30 },
]

const filteredScans = computed(() => {
  let result = data.value?.scans || []

  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    result = result.filter(s => s.site.toLowerCase().includes(q))
  }

  if (minScore.value !== null) {
    const scoreThreshold = minScore.value
    if (scoreThreshold < 0) {
      result = result.filter(s => s.avgScore !== null && s.avgScore < Math.abs(scoreThreshold))
    }
    else {
      result = result.filter(s => s.avgScore !== null && s.avgScore >= scoreThreshold)
    }
  }

  if (dateRange.value !== null) {
    const cutoff = Date.now() - dateRange.value * 24 * 60 * 60 * 1000
    result = result.filter(s => new Date(s.startedAt).getTime() >= cutoff)
  }

  result = [...result].sort((a, b) => {
    let cmp = 0
    if (sortBy.value === 'date') {
      cmp = new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime()
    }
    else if (sortBy.value === 'score') {
      cmp = (a.avgScore ?? -1) - (b.avgScore ?? -1)
    }
    else if (sortBy.value === 'perf') {
      cmp = (a.performanceScore ?? -1) - (b.performanceScore ?? -1)
    }
    else if (sortBy.value === 'a11y') {
      cmp = (a.accessibilityScore ?? -1) - (b.accessibilityScore ?? -1)
    }
    else if (sortBy.value === 'best') {
      cmp = (a.bestPracticesScore ?? -1) - (b.bestPracticesScore ?? -1)
    }
    else if (sortBy.value === 'seo') {
      cmp = (a.seoScore ?? -1) - (b.seoScore ?? -1)
    }
    else if (sortBy.value === 'routes') {
      cmp = a.routeCount - b.routeCount
    }
    return sortDir.value === 'desc' ? -cmp : cmp
  })

  return result
})

const isLoading = computed(() => status.value === 'pending')
const hasActiveFilters = computed(() => searchQuery.value || minScore.value !== null || dateRange.value !== null || sortBy.value !== 'date')

interface SiteGroup {
  site: string
  domain: string
  scans: Scan[]
  latestScore: number | null
  trend: 'up' | 'down' | 'stable' | null
  runningScan: Scan | null
}

const groupedScans = computed((): SiteGroup[] => {
  const groups = new Map<string, Scan[]>()
  for (const scan of filteredScans.value) {
    const existing = groups.get(scan.site) || []
    existing.push(scan)
    groups.set(scan.site, existing)
  }

  return Array.from(groups.entries()).map(([site, scans]) => {
    scans.sort((a, b) => {
      if (a.status === 'running' && b.status !== 'running') return -1
      if (b.status === 'running' && a.status !== 'running') return 1
      return new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    })
    const runningScan = scans.find(s => s.status === 'running') || null
    const completedScans = scans.filter(s => s.status !== 'running')
    const latest = completedScans[0]
    const previous = completedScans[1]
    let trend: 'up' | 'down' | 'stable' | null = null
    if (latest?.avgScore != null && previous?.avgScore != null) {
      const diff = latest.avgScore - previous.avgScore
      trend = diff > 2 ? 'up' : diff < -2 ? 'down' : 'stable'
    }
    return {
      site,
      domain: extractDomain(site),
      scans,
      latestScore: latest?.avgScore ?? null,
      trend,
      runningScan,
    }
  }).sort((a, b) => {
    if (a.runningScan && !b.runningScan) return -1
    if (b.runningScan && !a.runningScan) return 1
    const aDate = a.scans[0]?.startedAt ? new Date(a.scans[0].startedAt).getTime() : 0
    const bDate = b.scans[0]?.startedAt ? new Date(b.scans[0].startedAt).getTime() : 0
    return bDate - aDate
  })
})

const expandedSites = ref<Set<string>>(new Set())
function toggleSiteExpand(site: string) {
  if (expandedSites.value.has(site)) {
    expandedSites.value.delete(site)
  }
  else {
    expandedSites.value.add(site)
  }
  expandedSites.value = new Set(expandedSites.value)
}

// Selection state - no "select mode" needed, always available
const selectedIds = ref<Set<string>>(new Set())
const isBulkDeleting = ref(false)
const showDeleteConfirm = ref(false)

const hasSelection = computed(() => selectedIds.value.size > 0)
const allSelected = computed(() =>
  filteredScans.value.length > 0 && filteredScans.value.every(s => selectedIds.value.has(s.id)),
)

function isSelected(id: string) {
  return selectedIds.value.has(id)
}

function toggleSelect(id: string, event?: Event) {
  event?.stopPropagation()
  if (selectedIds.value.has(id)) {
    selectedIds.value.delete(id)
  }
  else {
    selectedIds.value.add(id)
  }
  selectedIds.value = new Set(selectedIds.value)
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.value = new Set()
  }
  else {
    selectedIds.value = new Set(filteredScans.value.map(s => s.id))
  }
}

function clearSelection() {
  selectedIds.value = new Set()
}

// Smart bulk actions
function selectOlderScansPerSite() {
  // Select all but the latest scan for each site
  const newSelection = new Set<string>()
  for (const group of groupedScans.value) {
    const completedScans = group.scans.filter(s => s.status !== 'running')
    // Skip the first (latest) completed scan, select the rest
    completedScans.slice(1).forEach(s => newSelection.add(s.id))
  }
  selectedIds.value = newSelection
}

function selectFailedScans() {
  selectedIds.value = new Set(
    filteredScans.value
      .filter(s => s.status === 'failed' || s.status === 'cancelled')
      .map(s => s.id),
  )
}

function selectScansOlderThan(days: number) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000
  selectedIds.value = new Set(
    filteredScans.value
      .filter(s => new Date(s.startedAt).getTime() < cutoff)
      .map(s => s.id),
  )
}

function selectSiteScans(site: string, excludeLatest = false) {
  const group = groupedScans.value.find(g => g.site === site)
  if (!group) return

  const scans = excludeLatest
    ? group.scans.filter(s => s.status !== 'running').slice(1)
    : group.scans

  scans.forEach(s => selectedIds.value.add(s.id))
  selectedIds.value = new Set(selectedIds.value)
}

async function bulkDelete() {
  isBulkDeleting.value = true
  const ids = [...selectedIds.value]
  await Promise.all(ids.map(id => $fetch(`${apiUrl.value}/history/${id}`, { method: 'DELETE' }).catch(() => {})))
  toast.add({ title: `${ids.length} scan${ids.length > 1 ? 's' : ''} deleted`, color: 'success' })
  showDeleteConfirm.value = false
  isBulkDeleting.value = false
  selectedIds.value = new Set()
  refresh()
}

const deleteConfirm = ref<{ open: boolean, scan: Scan | null }>({ open: false, scan: null })

function getScoreColor(score: number | null) {
  if (score === null) return 'text-gray-500'
  if (score >= 90) return 'text-green-400'
  if (score >= 50) return 'text-amber-400'
  return 'text-red-400'
}

function getScoreBg(score: number | null) {
  if (score === null) return 'bg-gray-500/10'
  if (score >= 90) return 'bg-green-500/10'
  if (score >= 50) return 'bg-amber-500/10'
  return 'bg-red-500/10'
}

function getStatusConfig(status: string): { label: string, icon: string, color: string } {
  const configs: Record<string, { label: string, icon: string, color: string }> = {
    running: { label: 'Running', icon: 'i-heroicons-arrow-path', color: 'text-amber-400' },
    complete: { label: 'Complete', icon: 'i-heroicons-check-circle', color: 'text-green-400' },
    cancelled: { label: 'Cancelled', icon: 'i-heroicons-x-circle', color: 'text-gray-400' },
    failed: { label: 'Failed', icon: 'i-heroicons-exclamation-triangle', color: 'text-red-400' },
  }
  return configs[status] ?? configs.complete!
}

function formatDate(date: string) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatRelativeTime(date: string) {
  const now = Date.now()
  const then = new Date(date).getTime()
  const diff = now - then
  const mins = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)

  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  return `${Math.floor(days / 30)}mo ago`
}

function viewScan(scan: Scan) {
  if (scan.status === 'running') {
    navigateTo(`/results/${scan.id}/scan`)
  }
  else {
    navigateTo(`/results/${scan.id}`)
  }
}

async function rescanSite(scan: Scan) {
  const result = await $fetch<{ scanId: string }>(`${apiUrl.value}/history/${scan.id}/rescan`, { method: 'POST' }).catch(() => null)
  toast.add({ title: 'Rescan started', description: `Scanning ${scan.site}`, color: 'success' })
  if (result?.scanId) {
    navigateTo(`/results/${result.scanId}/scan`)
  }
}

function confirmDelete(scan: Scan) {
  deleteConfirm.value = { open: true, scan }
}

async function deleteScan() {
  if (!deleteConfirm.value.scan) return
  await $fetch(`${apiUrl.value}/history/${deleteConfirm.value.scan.id}`, { method: 'DELETE' })
  toast.add({ title: 'Scan deleted', color: 'success' })
  deleteConfirm.value = { open: false, scan: null }
  refresh()
}

const extractDomain = (url: string) => {
  try { return new URL(url).hostname }
  catch { return url }
}

// Auto-refresh when there are running scans
const hasRunningScans = computed(() => data.value?.scans?.some(s => s.status === 'running'))
let refreshInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  refreshInterval = setInterval(() => {
    if (hasRunningScans.value) refresh()
  }, 3000)
})

onUnmounted(() => {
  if (refreshInterval) clearInterval(refreshInterval)
})

const dropdownItems = (scan: Scan) => [
  [{
    label: scan.status === 'running' ? 'View Progress' : 'View Results',
    icon: scan.status === 'running' ? 'i-heroicons-arrow-path' : 'i-heroicons-chart-bar',
    click: () => viewScan(scan),
  }],
  [{
    label: 'Rescan',
    icon: 'i-heroicons-arrow-path',
    click: () => rescanSite(scan),
  }],
  [{
    label: 'Delete',
    icon: 'i-heroicons-trash',
    color: 'error' as const,
    click: () => confirmDelete(scan),
  }],
]

// Smart action menu items
const smartSelectItems = [
  [{
    label: 'Keep only latest per site',
    icon: 'i-heroicons-funnel',
    click: () => selectOlderScansPerSite(),
  }],
  [{
    label: 'Failed & cancelled scans',
    icon: 'i-heroicons-exclamation-triangle',
    click: () => selectFailedScans(),
  }],
  [{
    label: 'Older than 7 days',
    icon: 'i-heroicons-clock',
    click: () => selectScansOlderThan(7),
  },
  {
    label: 'Older than 30 days',
    icon: 'i-heroicons-clock',
    click: () => selectScansOlderThan(30),
  }],
]
</script>

<template>
  <div class="min-h-screen bg-[#0d0d0d] text-gray-100">
    <!-- Header -->
    <header class="border-b border-white/5 bg-[#0d0d0d]/80 backdrop-blur-sm sticky top-0 z-50">
      <div class="max-w-[1800px] mx-auto px-6 h-14 flex items-center justify-between">
        <div class="flex items-center gap-4">
          <NuxtLink to="/" class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center">
              <UIcon name="i-heroicons-light-bulb" class="w-5 h-5 text-white" />
            </div>
            <span class="font-semibold text-lg tracking-tight">Unlighthouse</span>
          </NuxtLink>
          <div class="h-5 w-px bg-white/10" />
          <span class="text-sm text-gray-400">Scan History</span>
        </div>

        <div class="flex items-center gap-3">
          <UButton
            to="/onboarding"
            icon="i-heroicons-plus"
            color="primary"
          >
            New Scan
          </UButton>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main class="max-w-5xl mx-auto py-8 px-6 pb-32">
      <!-- Search & Filters -->
      <div class="mb-6 space-y-4">
        <div class="flex gap-3">
          <UInput
            v-model="searchQuery"
            placeholder="Search by URL..."
            icon="i-heroicons-magnifying-glass"
            class="flex-1"
            :ui="{ base: 'bg-white/5 border-white/10' }"
          />
          <!-- Smart Select Dropdown -->
          <UDropdownMenu :items="smartSelectItems">
            <UButton
              icon="i-heroicons-squares-2x2"
              variant="outline"
              color="neutral"
            >
              Select
            </UButton>
          </UDropdownMenu>
          <!-- Group Toggle -->
          <div class="flex rounded-lg overflow-hidden border border-white/10">
            <button
              class="px-3 py-2 text-sm transition-colors"
              :class="groupBy === 'site' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'"
              @click="groupBy = 'site'"
            >
              <UIcon name="i-heroicons-rectangle-group" class="w-4 h-4" />
            </button>
            <button
              class="px-3 py-2 text-sm transition-colors border-l border-white/10"
              :class="groupBy === 'none' ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'"
              @click="groupBy = 'none'"
            >
              <UIcon name="i-heroicons-list-bullet" class="w-4 h-4" />
            </button>
          </div>
          <UButton
            :icon="showFilters ? 'i-heroicons-funnel-solid' : 'i-heroicons-funnel'"
            :color="hasActiveFilters ? 'primary' : 'neutral'"
            variant="outline"
            @click="showFilters = !showFilters"
          >
            Filters
          </UButton>
        </div>

        <!-- Filter Panel -->
        <div v-if="showFilters" class="flex flex-wrap gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-lg">
          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-400">Sort:</span>
            <div class="flex gap-1">
              <button
                v-for="opt in sortOptions"
                :key="opt.value"
                class="px-2 py-1 text-xs rounded transition-colors"
                :class="sortBy === opt.value ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'"
                @click="sortBy = opt.value as any"
              >
                {{ opt.label }}
              </button>
            </div>
            <button
              class="p-1 rounded hover:bg-white/10"
              @click="sortDir = sortDir === 'desc' ? 'asc' : 'desc'"
            >
              <UIcon
                :name="sortDir === 'desc' ? 'i-heroicons-arrow-down' : 'i-heroicons-arrow-up'"
                class="w-4 h-4 text-gray-400"
              />
            </button>
          </div>

          <div class="h-6 w-px bg-white/10" />

          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-400">Score:</span>
            <div class="flex gap-1">
              <button
                v-for="opt in scoreFilterOptions"
                :key="opt.value ?? 'all'"
                class="px-2 py-1 text-xs rounded transition-colors"
                :class="minScore === opt.value ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'"
                @click="minScore = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <div class="h-6 w-px bg-white/10" />

          <div class="flex items-center gap-2">
            <span class="text-sm text-gray-400">Date:</span>
            <div class="flex gap-1">
              <button
                v-for="opt in dateRangeOptions"
                :key="opt.value ?? 'all'"
                class="px-2 py-1 text-xs rounded transition-colors"
                :class="dateRange === opt.value ? 'bg-amber-500/20 text-amber-400' : 'bg-white/5 text-gray-400 hover:bg-white/10'"
                @click="dateRange = opt.value"
              >
                {{ opt.label }}
              </button>
            </div>
          </div>

          <button
            v-if="hasActiveFilters"
            class="ml-auto text-xs text-gray-400 hover:text-white"
            @click="searchQuery = ''; sortBy = 'date'; minScore = null; dateRange = null"
          >
            Clear all
          </button>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="space-y-4">
        <LoadingSkeletonScanCard v-for="i in 4" :key="i" />
      </div>

      <!-- Empty State -->
      <div v-else-if="filteredScans.length === 0 && !searchQuery && minScore === null" class="flex flex-col items-center justify-center py-20">
        <UIcon name="i-heroicons-clock" class="w-16 h-16 text-gray-600 mb-4" />
        <h2 class="text-xl font-semibold mb-2">No scan history</h2>
        <p class="text-gray-500 mb-6">Start your first scan to see results here</p>
        <UButton to="/onboarding" icon="i-heroicons-plus" color="primary">
          Start New Scan
        </UButton>
      </div>

      <!-- No Results State -->
      <div v-else-if="filteredScans.length === 0" class="flex flex-col items-center justify-center py-20">
        <UIcon name="i-heroicons-magnifying-glass" class="w-12 h-12 text-gray-600 mb-4" />
        <h2 class="text-lg font-semibold mb-2">No matching scans</h2>
        <p class="text-gray-500">Try adjusting your search or filters</p>
      </div>

      <!-- Grouped Scan List -->
      <div v-else-if="groupBy === 'site'" class="space-y-6">
        <div
          v-for="group in groupedScans"
          :key="group.site"
          class="bg-white/[0.01] border border-white/5 rounded-xl overflow-hidden"
        >
          <!-- Site Header -->
          <div
            class="p-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.02] transition-colors"
            @click="viewScan(group.scans[0])"
          >
            <div class="flex items-center gap-3">
              <img
                :src="`https://www.google.com/s2/favicons?domain=${group.domain}&sz=32`"
                :alt="group.site"
                class="w-6 h-6 rounded"
                loading="lazy"
              >
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-mono text-lg text-white">{{ group.domain }}</span>
                  <span class="text-xs text-gray-500">({{ group.scans.length }} scan{{ group.scans.length > 1 ? 's' : '' }})</span>
                </div>
              </div>
            </div>
            <div class="flex items-center gap-4">
              <!-- Running Scan Progress -->
              <div v-if="group.runningScan" class="flex items-center gap-3 min-w-[180px]">
                <div class="flex-1">
                  <div class="flex items-center justify-between text-xs mb-1">
                    <span class="text-amber-400 flex items-center gap-1">
                      <UIcon name="i-svg-spinners-90-ring-with-bg" class="w-3 h-3" />
                      Scanning...
                    </span>
                    <span class="text-gray-500">{{ group.runningScan.scannedCount }}/{{ group.runningScan.routeCount }}</span>
                  </div>
                  <div class="h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      class="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                      :style="{ width: `${group.runningScan.routeCount > 0 ? (group.runningScan.scannedCount / group.runningScan.routeCount) * 100 : 0}%` }"
                    />
                  </div>
                </div>
              </div>
              <!-- Latest Score with Trend -->
              <div v-if="group.latestScore !== null" class="flex items-center gap-2">
                <div
                  class="w-12 h-12 rounded-lg flex items-center justify-center font-mono font-bold text-lg"
                  :class="[getScoreBg(group.latestScore), getScoreColor(group.latestScore)]"
                >
                  {{ group.latestScore }}
                </div>
                <UIcon
                  v-if="group.trend === 'up'"
                  name="i-heroicons-arrow-trending-up"
                  class="w-5 h-5 text-green-400"
                />
                <UIcon
                  v-else-if="group.trend === 'down'"
                  name="i-heroicons-arrow-trending-down"
                  class="w-5 h-5 text-red-400"
                />
              </div>
              <!-- Expand Toggle -->
              <button
                v-if="group.scans.length > 1"
                class="p-2 rounded-lg hover:bg-white/10 transition-colors"
                @click.stop="toggleSiteExpand(group.site)"
              >
                <UIcon
                  :name="expandedSites.has(group.site) ? 'i-heroicons-chevron-up' : 'i-heroicons-chevron-down'"
                  class="w-5 h-5 text-gray-400"
                />
              </button>
            </div>
          </div>

          <!-- Scan History List -->
          <div class="border-t border-white/5 bg-black/20">
            <div
              v-for="(scan, idx) in group.scans"
              :key="scan.id"
              class="group/row relative flex items-center hover:bg-white/[0.02] transition-colors"
              :class="[
                idx > 0 ? 'border-t border-white/5' : '',
                isSelected(scan.id) ? 'bg-amber-500/5 ring-1 ring-inset ring-amber-500/30' : ''
              ]"
            >
              <!-- Checkbox Column - always visible on left edge -->
              <div class="w-12 flex-shrink-0 flex items-center justify-center">
                <button
                  class="w-5 h-5 rounded border-2 transition-all flex items-center justify-center"
                  :class="[
                    isSelected(scan.id)
                      ? 'bg-amber-500 border-amber-500 scale-100'
                      : 'border-white/20 hover:border-amber-400/50 opacity-0 group-hover/row:opacity-100 scale-90 hover:scale-100',
                    isSelected(scan.id) ? 'opacity-100' : ''
                  ]"
                  @click="toggleSelect(scan.id, $event)"
                >
                  <UIcon
                    v-if="isSelected(scan.id)"
                    name="i-heroicons-check"
                    class="w-3 h-3 text-black"
                  />
                </button>
              </div>

              <!-- Content -->
              <div
                class="flex-1 px-2 py-3 pr-4 flex items-center justify-between cursor-pointer"
                @click="viewScan(scan)"
              >
                <div class="flex items-center gap-4 text-sm">
                  <UTooltip :text="formatDate(scan.startedAt)">
                    <span class="text-gray-400 w-20">{{ formatRelativeTime(scan.startedAt) }}</span>
                  </UTooltip>
                  <span class="text-gray-500">{{ scan.device }}</span>
                  <span class="text-gray-500">{{ scan.routeCount }} routes</span>
                  <div
                    class="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                    :class="[getStatusConfig(scan.status).color, 'bg-white/5']"
                  >
                    <UIcon :name="getStatusConfig(scan.status).icon" class="w-3 h-3" />
                    {{ getStatusConfig(scan.status).label }}
                  </div>
                </div>
                <div v-if="scan.avgScore !== null" class="flex items-center gap-1.5">
                  <div
                    v-for="(score, key) in { Perf: scan.performanceScore, A11y: scan.accessibilityScore, Best: scan.bestPracticesScore, SEO: scan.seoScore }"
                    :key="key"
                    class="w-8 h-8 rounded flex items-center justify-center font-mono text-xs"
                    :class="[getScoreBg(score), getScoreColor(score)]"
                  >
                    {{ score ?? '-' }}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Flat Scan List -->
      <div v-else class="space-y-4">
        <div
          v-for="scan in filteredScans"
          :key="scan.id"
          class="group/card relative bg-white/[0.02] hover:bg-white/[0.04] border rounded-xl transition-all"
          :class="[
            isSelected(scan.id)
              ? 'border-amber-500/40 bg-amber-500/5 ring-1 ring-amber-500/20'
              : 'border-white/5 hover:border-white/10'
          ]"
        >
          <div class="flex items-start p-5 gap-4">
            <!-- Checkbox -->
            <button
              class="mt-1 flex-shrink-0 w-5 h-5 rounded border-2 transition-all flex items-center justify-center"
              :class="[
                isSelected(scan.id)
                  ? 'bg-amber-500 border-amber-500 scale-100'
                  : 'border-white/20 hover:border-amber-400/50 opacity-0 group-hover/card:opacity-100 scale-90 hover:scale-100'
              ]"
              @click="toggleSelect(scan.id, $event)"
            >
              <UIcon
                v-if="isSelected(scan.id)"
                name="i-heroicons-check"
                class="w-3 h-3 text-black"
              />
            </button>

            <!-- Site Info -->
            <div class="flex-1 min-w-0 cursor-pointer" @click="viewScan(scan)">
              <div class="flex items-center gap-3 mb-2">
                <img
                  :src="`https://www.google.com/s2/favicons?domain=${extractDomain(scan.site)}&sz=32`"
                  :alt="scan.site"
                  class="w-5 h-5 rounded"
                  loading="lazy"
                >
                <a
                  :href="scan.site"
                  target="_blank"
                  class="font-mono text-lg text-white hover:text-amber-400 transition-colors truncate"
                  @click.stop
                >
                  {{ scan.site }}
                </a>
                <div
                  class="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs"
                  :class="[getStatusConfig(scan.status).color, 'bg-white/5']"
                >
                  <UIcon :name="getStatusConfig(scan.status).icon" class="w-3 h-3" />
                  {{ getStatusConfig(scan.status).label }}
                </div>
              </div>

              <div class="flex items-center gap-4 text-sm text-gray-500">
                <UTooltip :text="formatDate(scan.startedAt)">
                  <span class="flex items-center gap-1.5 cursor-help">
                    <UIcon name="i-heroicons-clock" class="w-4 h-4" />
                    {{ formatRelativeTime(scan.startedAt) }}
                  </span>
                </UTooltip>
                <span class="flex items-center gap-1.5">
                  <UIcon name="i-heroicons-device-phone-mobile" class="w-4 h-4" />
                  {{ scan.device }}
                </span>
                <span class="flex items-center gap-1.5">
                  <UIcon name="i-heroicons-document-text" class="w-4 h-4" />
                  {{ scan.routeCount }} routes
                </span>
              </div>
            </div>

            <!-- Progress (for running scans) -->
            <div v-if="scan.status === 'running'" class="flex items-center gap-4 min-w-[200px]">
              <div class="flex-1">
                <div class="flex items-center justify-between text-xs mb-1">
                  <span class="text-amber-400 flex items-center gap-1">
                    <UIcon name="i-svg-spinners-90-ring-with-bg" class="w-3 h-3" />
                    Scanning...
                  </span>
                  <span class="text-gray-500">{{ scan.scannedCount }}/{{ scan.routeCount }}</span>
                </div>
                <div class="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    class="h-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-300"
                    :style="{ width: `${scan.routeCount > 0 ? (scan.scannedCount / scan.routeCount) * 100 : 0}%` }"
                  />
                </div>
              </div>
            </div>

            <!-- Scores (for completed scans) -->
            <div v-else-if="scan.avgScore !== null" class="flex items-center gap-2">
              <div
                v-for="(score, key) in { Perf: scan.performanceScore, A11y: scan.accessibilityScore, Best: scan.bestPracticesScore, SEO: scan.seoScore }"
                :key="key"
                class="text-center"
              >
                <div
                  class="w-10 h-10 rounded-lg flex items-center justify-center font-mono font-semibold text-sm"
                  :class="[getScoreBg(score), getScoreColor(score)]"
                >
                  {{ score ?? '-' }}
                </div>
                <div class="text-[10px] text-gray-500 mt-1">{{ key }}</div>
              </div>
            </div>

            <!-- Actions -->
            <UDropdownMenu :items="dropdownItems(scan)">
              <UButton
                icon="i-heroicons-ellipsis-vertical"
                variant="ghost"
                color="neutral"
                size="sm"
                @click.stop
              />
            </UDropdownMenu>
          </div>
        </div>
      </div>
    </main>

    <!-- Floating Action Bar -->
    <Transition
      enter-active-class="transition-all duration-300 ease-out"
      enter-from-class="translate-y-full opacity-0"
      enter-to-class="translate-y-0 opacity-100"
      leave-active-class="transition-all duration-200 ease-in"
      leave-from-class="translate-y-0 opacity-100"
      leave-to-class="translate-y-full opacity-0"
    >
      <div
        v-if="hasSelection"
        class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50"
      >
        <div
          class="flex items-center gap-4 px-5 py-3 rounded-2xl border border-white/10 bg-[#1a1a1a]/95 backdrop-blur-xl shadow-2xl shadow-black/50"
        >
          <!-- Selection Count -->
          <div class="flex items-center gap-3">
            <button
              class="w-5 h-5 rounded border-2 transition-all flex items-center justify-center"
              :class="allSelected ? 'bg-amber-500 border-amber-500' : 'border-white/30 hover:border-amber-400'"
              @click="toggleSelectAll"
            >
              <UIcon v-if="allSelected" name="i-heroicons-check" class="w-3 h-3 text-black" />
              <UIcon v-else-if="hasSelection" name="i-heroicons-minus" class="w-3 h-3 text-white/50" />
            </button>
            <span class="text-sm font-medium">
              <span class="text-amber-400">{{ selectedIds.size }}</span>
              <span class="text-gray-400"> selected</span>
            </span>
          </div>

          <div class="h-6 w-px bg-white/10" />

          <!-- Quick Actions -->
          <div class="flex items-center gap-2">
            <UButton
              icon="i-heroicons-trash"
              color="error"
              variant="soft"
              @click="showDeleteConfirm = true"
            >
              Delete
            </UButton>
            <UButton
              icon="i-heroicons-x-mark"
              variant="ghost"
              color="neutral"
              @click="clearSelection"
            >
              Clear
            </UButton>
          </div>
        </div>
      </div>
    </Transition>

    <!-- Delete Confirmation Modal -->
    <UModal v-model:open="deleteConfirm.open" title="Delete Scan?">
      <template #body>
        <p class="text-gray-400 p-4">
          Are you sure you want to delete this scan? This action cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 p-4">
          <UButton variant="ghost" color="neutral" @click="deleteConfirm.open = false">
            Cancel
          </UButton>
          <UButton color="error" @click="deleteScan">
            Delete
          </UButton>
        </div>
      </template>
    </UModal>

    <!-- Bulk Delete Confirmation Modal -->
    <UModal v-model:open="showDeleteConfirm" title="Delete Multiple Scans?">
      <template #body>
        <p class="text-gray-400 p-4">
          Are you sure you want to delete {{ selectedIds.size }} scan{{ selectedIds.size > 1 ? 's' : '' }}? This action cannot be undone.
        </p>
      </template>
      <template #footer>
        <div class="flex justify-end gap-3 p-4">
          <UButton variant="ghost" color="neutral" @click="showDeleteConfirm = false" :disabled="isBulkDeleting">
            Cancel
          </UButton>
          <UButton color="error" :loading="isBulkDeleting" @click="bulkDelete">
            Delete {{ selectedIds.size }}
          </UButton>
        </div>
      </template>
    </UModal>
  </div>
</template>

<style scoped>
/* Checkbox reveal animation */
.group\/row:hover .opacity-0,
.group\/card:hover .opacity-0 {
  opacity: 1;
}
</style>
