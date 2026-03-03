<script setup lang="ts">
import { useDashboard, getScoreColor, getScoreBg, formatMs } from '~/composables/dashboard'
import { formatBytes } from '~/utils'

definePageMeta({ layout: 'results' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)

const { performance } = useDashboard(scanId)

onMounted(() => {
  if (scanId.value) performance.execute()
})

const activeTab = ref(0)
const tabs = [
  { label: 'Web Vitals', icon: 'i-heroicons-chart-bar' },
  { label: 'Images', icon: 'i-heroicons-photo' },
  { label: 'Third-Party', icon: 'i-heroicons-globe-alt' },
  { label: 'LCP Elements', icon: 'i-heroicons-clock' },
  { label: 'Routes', icon: 'i-heroicons-queue-list' },
]

// Web Vitals thresholds (Google's Core Web Vitals thresholds)
const vitalsThresholds: Record<string, { good: number, poor: number, unit: string, label: string, abbr: string, decimals?: number }> = {
  lcp: { good: 2500, poor: 4000, unit: 'ms', label: 'Largest Contentful Paint', abbr: 'LCP' },
  cls: { good: 0.1, poor: 0.25, unit: '', label: 'Cumulative Layout Shift', abbr: 'CLS', decimals: 3 },
  tbt: { good: 200, poor: 600, unit: 'ms', label: 'Total Blocking Time', abbr: 'TBT' },
  fcp: { good: 1800, poor: 3000, unit: 'ms', label: 'First Contentful Paint', abbr: 'FCP' },
  si: { good: 3400, poor: 5800, unit: 'ms', label: 'Speed Index', abbr: 'SI' },
  ttfb: { good: 800, poor: 1800, unit: 'ms', label: 'Time to First Byte', abbr: 'TTFB' },
}

const getVitalRating = (value: number, metric: keyof typeof vitalsThresholds) => {
  const threshold = vitalsThresholds[metric]
  if (value <= threshold.good) return 'good'
  if (value <= threshold.poor) return 'needs-improvement'
  return 'poor'
}

const getVitalColor = (rating: string) => {
  if (rating === 'good') return 'text-green-400'
  if (rating === 'needs-improvement') return 'text-amber-400'
  return 'text-red-400'
}

const getVitalBg = (rating: string) => {
  if (rating === 'good') return 'bg-green-500/10 border-green-500/20'
  if (rating === 'needs-improvement') return 'bg-amber-500/10 border-amber-500/20'
  return 'bg-red-500/10 border-red-500/20'
}

// Calculate position on spectrum (0-100%)
const getSpectrumPosition = (value: number, good: number, poor: number) => {
  // Use a max of 2x poor threshold for the scale
  const max = poor * 2
  const position = Math.min((value / max) * 100, 100)
  return position
}

const webVitals = computed(() => {
  const routes = performance.data.value?.routes ?? []
  const withScores = routes.filter(r => r.score !== null)
  if (!withScores.length) return []

  const calcAvg = (key: string) => {
    const valid = withScores.filter(r => (r as any)[key] !== null && (r as any)[key] !== undefined)
    if (!valid.length) return null
    return valid.reduce((a, r) => a + ((r as any)[key] ?? 0), 0) / valid.length
  }

  return Object.keys(vitalsThresholds).map((key) => {
    const avg = calcAvg(key)
    if (avg === null) return null
    const threshold = vitalsThresholds[key]
    const rating = getVitalRating(avg, key)
    return {
      key,
      label: threshold.label,
      abbr: threshold.abbr,
      value: threshold.decimals ? avg.toFixed(threshold.decimals) : Math.round(avg),
      unit: threshold.unit,
      rating,
      good: threshold.good,
      poor: threshold.poor,
    }
  }).filter(Boolean) as Array<{ key: string, label: string, abbr: string, value: string | number, unit: string, rating: string, good: number, poor: number }>
})

const avgScore = computed(() => {
  const routes = performance.data.value?.routes ?? []
  const withScores = routes.filter(r => r.score !== null)
  if (!withScores.length) return null
  return Math.round(withScores.reduce((a, r) => a + (r.score ?? 0), 0) / withScores.length)
})

const summaryStats = computed(() => {
  const routes = performance.data.value?.routes ?? []
  const withScores = routes.filter(r => r.score !== null)
  if (!withScores.length) return []

  const withLcp = withScores.filter(r => r.lcp)
  const withCls = withScores.filter(r => r.cls !== null)
  const withTbt = withScores.filter(r => r.tbt)

  const avgLcp = withLcp.length ? Math.round(withLcp.reduce((a, r) => a + (r.lcp ?? 0), 0) / withLcp.length) : null
  const avgCls = withCls.length ? (withCls.reduce((a, r) => a + (r.cls ?? 0), 0) / withCls.length).toFixed(3) : null
  const avgTbt = withTbt.length ? Math.round(withTbt.reduce((a, r) => a + (r.tbt ?? 0), 0) / withTbt.length) : null

  const lcpColor = avgLcp !== null ? (avgLcp <= 2500 ? 'text-green-400' : avgLcp <= 4000 ? 'text-amber-400' : 'text-red-400') : undefined
  const clsColor = avgCls !== null ? (Number(avgCls) <= 0.1 ? 'text-green-400' : Number(avgCls) <= 0.25 ? 'text-amber-400' : 'text-red-400') : undefined
  const tbtColor = avgTbt !== null ? (avgTbt <= 200 ? 'text-green-400' : avgTbt <= 600 ? 'text-amber-400' : 'text-red-400') : undefined

  return [
    { label: 'Pages', value: routes.length, icon: 'i-heroicons-document-text' },
    { label: 'Avg LCP', value: avgLcp ? formatMs(avgLcp) : '-', color: lcpColor, icon: 'i-heroicons-photo' },
    { label: 'Avg CLS', value: avgCls ?? '-', color: clsColor, icon: 'i-heroicons-arrows-pointing-out' },
    { label: 'Avg TBT', value: avgTbt ? formatMs(avgTbt) : '-', color: tbtColor, icon: 'i-heroicons-clock' },
  ]
})


const sortedIssues = computed(() =>
  [...(performance.data.value?.issues ?? [])].sort((a, b) => b.wastedBytes - a.wastedBytes),
)

const sortedThirdParty = computed(() =>
  [...(performance.data.value?.thirdParty ?? [])].sort((a, b) => b.totalTbt - a.totalTbt),
)

const sortedLcp = computed(() =>
  [...(performance.data.value?.lcpElements ?? [])].sort((a, b) => b.pageCount - a.pageCount),
)

const sortedRoutes = computed(() =>
  [...(performance.data.value?.routes ?? [])]
    .filter(r => r.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0)),
)
</script>

<template>
  <div>
    <DashboardHeader
      title="Performance"
      icon="i-heroicons-bolt"
      color="text-green-400"
      :score="avgScore"
      :stats="summaryStats"
    />

    <!-- Tabs -->
    <div class="flex gap-2 mb-6 border-b border-white/5 pb-4">
      <button
        v-for="(tab, idx) in tabs"
        :key="tab.label"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all"
        :class="activeTab === idx
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : 'text-gray-400 hover:text-white hover:bg-white/5'"
        @click="activeTab = idx"
      >
        <UIcon :name="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="performance.status.value === 'pending'" class="space-y-4">
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
    </div>

    <!-- Web Vitals Tab -->
    <div v-else-if="activeTab === 0">
      <div v-if="!webVitals.length" class="text-center py-8 text-gray-500">
        <UIcon name="i-heroicons-information-circle" class="w-8 h-8 mx-auto mb-2" />
        <p>No Web Vitals data available</p>
      </div>
      <div v-else class="space-y-6">
        <!-- Core Web Vitals (LCP, CLS, TBT) -->
        <DashboardCard title="Core Web Vitals" icon="i-heroicons-chart-bar">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              v-for="vital in webVitals.filter(v => ['lcp', 'cls', 'tbt'].includes(v.key))"
              :key="vital.key"
              class="rounded-xl border p-5"
              :class="getVitalBg(vital.rating)"
            >
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-gray-400">{{ vital.abbr }}</span>
                <span
                  class="text-xs px-2 py-0.5 rounded-full capitalize"
                  :class="[
                    getVitalColor(vital.rating),
                    vital.rating === 'good' ? 'bg-green-500/20' : vital.rating === 'needs-improvement' ? 'bg-amber-500/20' : 'bg-red-500/20'
                  ]"
                >
                  {{ vital.rating.replace('-', ' ') }}
                </span>
              </div>
              <div class="text-2xl font-mono font-bold mb-1" :class="getVitalColor(vital.rating)">
                {{ vital.value }}{{ vital.unit }}
              </div>
              <div class="text-xs text-gray-500 mb-4">{{ vital.label }}</div>

              <!-- Spectrum bar -->
              <div class="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-green-500 via-amber-500 to-red-500">
                <!-- Marker for current value -->
                <div
                  class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 shadow-lg transition-all"
                  :class="vital.rating === 'good' ? 'border-green-500' : vital.rating === 'needs-improvement' ? 'border-amber-500' : 'border-red-500'"
                  :style="{ left: `calc(${getSpectrumPosition(Number(vital.value), vital.good, vital.poor)}% - 6px)` }"
                />
              </div>
              <!-- Threshold labels -->
              <div class="flex justify-between mt-2 text-xs text-gray-500">
                <span>0</span>
                <span class="text-green-400">{{ vital.good }}{{ vital.unit }}</span>
                <span class="text-red-400">{{ vital.poor }}{{ vital.unit }}</span>
              </div>
            </div>
          </div>
        </DashboardCard>

        <!-- Other Metrics (FCP, SI, TTFB) -->
        <DashboardCard title="Other Performance Metrics" icon="i-heroicons-clock">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              v-for="vital in webVitals.filter(v => ['fcp', 'si', 'ttfb'].includes(v.key))"
              :key="vital.key"
              class="rounded-xl border p-5"
              :class="getVitalBg(vital.rating)"
            >
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-gray-400">{{ vital.abbr }}</span>
                <span
                  class="text-xs px-2 py-0.5 rounded-full capitalize"
                  :class="[
                    getVitalColor(vital.rating),
                    vital.rating === 'good' ? 'bg-green-500/20' : vital.rating === 'needs-improvement' ? 'bg-amber-500/20' : 'bg-red-500/20'
                  ]"
                >
                  {{ vital.rating.replace('-', ' ') }}
                </span>
              </div>
              <div class="text-2xl font-mono font-bold mb-1" :class="getVitalColor(vital.rating)">
                {{ vital.value }}{{ vital.unit }}
              </div>
              <div class="text-xs text-gray-500 mb-4">{{ vital.label }}</div>

              <!-- Spectrum bar -->
              <div class="relative h-2 rounded-full overflow-hidden bg-gradient-to-r from-green-500 via-amber-500 to-red-500">
                <!-- Marker for current value -->
                <div
                  class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white border-2 shadow-lg transition-all"
                  :class="vital.rating === 'good' ? 'border-green-500' : vital.rating === 'needs-improvement' ? 'border-amber-500' : 'border-red-500'"
                  :style="{ left: `calc(${getSpectrumPosition(Number(vital.value), vital.good, vital.poor)}% - 6px)` }"
                />
              </div>
              <!-- Threshold labels -->
              <div class="flex justify-between mt-2 text-xs text-gray-500">
                <span>0</span>
                <span class="text-green-400">{{ vital.good }}{{ vital.unit }}</span>
                <span class="text-red-400">{{ vital.poor }}{{ vital.unit }}</span>
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>

    <!-- Images Tab -->
    <div v-else-if="activeTab === 1">
      <DashboardCard title="Image Optimization Issues" icon="i-heroicons-photo" :count="sortedIssues.length">
        <div v-if="!sortedIssues.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No image optimization issues found</p>
        </div>
        <div v-else class="divide-y divide-white/5">
          <div v-for="issue in sortedIssues" :key="issue.id" class="py-3 first:pt-0 last:pb-0">
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="text-sm text-white font-mono truncate">{{ issue.url }}</div>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">{{ issue.issueType }}</span>
                  <span class="text-xs text-gray-500">{{ issue.pages.length }} pages</span>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="text-sm font-mono text-red-400">{{ formatBytes(issue.wastedBytes) }}</div>
                <div v-if="issue.wastedMs" class="text-xs text-gray-500">{{ formatMs(issue.wastedMs) }}</div>
              </div>
            </div>
            <PagesList v-if="issue.pages.length" :pages="issue.pages" class="mt-2" />
          </div>
        </div>
      </DashboardCard>
    </div>

    <!-- Third-Party Tab -->
    <div v-else-if="activeTab === 2">
      <DashboardCard title="Third-Party Scripts" icon="i-heroicons-globe-alt" :count="sortedThirdParty.length">
        <div v-if="!sortedThirdParty.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No third-party scripts detected</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-white/5">
                <th class="pb-2 font-medium">Entity</th>
                <th class="pb-2 font-medium text-right">Avg TBT</th>
                <th class="pb-2 font-medium text-right">Total TBT</th>
                <th class="pb-2 font-medium text-right">Pages</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              <tr v-for="tp in sortedThirdParty" :key="tp.entity">
                <td class="py-3 text-white">{{ tp.entity }}</td>
                <td class="py-3 text-right font-mono text-amber-400">{{ formatMs(tp.avgTbt) }}</td>
                <td class="py-3 text-right font-mono text-red-400">{{ formatMs(tp.totalTbt) }}</td>
                <td class="py-3 text-right text-gray-400">{{ tp.pageCount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>

    <!-- LCP Elements Tab -->
    <div v-else-if="activeTab === 3">
      <DashboardCard title="Largest Contentful Paint Elements" icon="i-heroicons-clock" :count="sortedLcp.length">
        <div v-if="!sortedLcp.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-information-circle" class="w-8 h-8 mx-auto mb-2" />
          <p>No LCP element data available</p>
        </div>
        <div v-else class="divide-y divide-white/5">
          <div v-for="lcp in sortedLcp" :key="lcp.selector" class="py-4 first:pt-0 last:pb-0">
            <div class="flex items-start gap-4">
              <!-- Element type icon -->
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                :class="lcp.avgLcp > 2500 ? 'bg-red-500/10' : lcp.avgLcp > 1800 ? 'bg-amber-500/10' : 'bg-green-500/10'"
              >
                <UIcon
                  :name="lcp.elementType === 'image' ? 'i-heroicons-photo' : lcp.elementType === 'video' ? 'i-heroicons-video-camera' : 'i-heroicons-document-text'"
                  class="w-5 h-5"
                  :class="lcp.avgLcp > 2500 ? 'text-red-400' : lcp.avgLcp > 1800 ? 'text-amber-400' : 'text-green-400'"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span
                    class="text-xs px-2 py-0.5 rounded capitalize"
                    :class="lcp.elementType === 'image' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : lcp.elementType === 'video' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'"
                  >
                    {{ lcp.elementType || 'unknown' }}
                  </span>
                  <span class="text-xs text-gray-500">{{ lcp.pageCount }} page{{ lcp.pageCount !== 1 ? 's' : '' }}</span>
                </div>
                <div class="text-sm font-mono text-white truncate" :title="lcp.selector">{{ lcp.selector }}</div>
                <div class="flex items-center gap-4 mt-2">
                  <div class="text-sm">
                    <span class="text-gray-500">Avg LCP:</span>
                    <span
                      class="font-mono ml-1"
                      :class="lcp.avgLcp > 2500 ? 'text-red-400' : lcp.avgLcp > 1800 ? 'text-amber-400' : 'text-green-400'"
                    >
                      {{ formatMs(lcp.avgLcp) }}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            <PagesList v-if="lcp.pages?.length" :pages="lcp.pages" class="mt-3 ml-14" />
          </div>
        </div>
      </DashboardCard>
    </div>

    <!-- Routes Tab -->
    <div v-else-if="activeTab === 4">
      <DashboardCard title="Routes by Performance Score" icon="i-heroicons-queue-list" :count="sortedRoutes.length">
        <div v-if="!sortedRoutes.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-information-circle" class="w-8 h-8 mx-auto mb-2" />
          <p>No route data available</p>
        </div>
        <div v-else class="divide-y divide-white/5">
          <NuxtLink
            v-for="r in sortedRoutes"
            :key="r.path"
            :to="`/results/${scanId}?path=${encodeURIComponent(r.path)}`"
            class="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 hover:bg-white/[0.02] -mx-4 px-4 transition-colors"
          >
            <div class="min-w-0 flex-1">
              <div class="text-sm font-mono text-white truncate">{{ r.path }}</div>
              <div class="flex items-center gap-3 mt-1 text-xs text-gray-500">
                <span v-if="r.lcp">LCP: {{ formatMs(r.lcp) }}</span>
                <span v-if="r.cls !== null">CLS: {{ r.cls.toFixed(3) }}</span>
                <span v-if="r.tbt">TBT: {{ formatMs(r.tbt) }}</span>
              </div>
            </div>
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center font-mono font-bold"
              :class="[getScoreBg(r.score), getScoreColor(r.score)]"
            >
              {{ r.score }}
            </div>
          </NuxtLink>
        </div>
      </DashboardCard>
    </div>
  </div>
</template>
