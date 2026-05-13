<script setup lang="ts">
import { formatMs, getScoreBg, getScoreColor, useDashboard } from '~/composables/dashboard'
import { formatBytes } from '~/utils'

definePageMeta({ layout: 'site' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)

const { performance, crux } = useDashboard(scanId)

onMounted(() => {
  if (scanId.value) {
    performance.execute()
    crux.execute()
  }
})

const cruxFormFactor = ref<'phone' | 'desktop'>('phone')
const cruxSeries = computed(() => crux.data.value?.[cruxFormFactor.value])
const hasPhoneCrux = computed(() => {
  const s = crux.data.value?.phone
  return !!s && (s.lcp.length || s.inp.length || s.cls.length)
})
const hasDesktopCrux = computed(() => {
  const s = crux.data.value?.desktop
  return !!s && (s.lcp.length || s.inp.length || s.cls.length)
})
const hasAnyCrux = computed(() => hasPhoneCrux.value || hasDesktopCrux.value)
watchEffect(() => {
  if (!hasAnyCrux.value)
    return
  if (cruxFormFactor.value === 'phone' && !hasPhoneCrux.value && hasDesktopCrux.value)
    cruxFormFactor.value = 'desktop'
  else if (cruxFormFactor.value === 'desktop' && !hasDesktopCrux.value && hasPhoneCrux.value)
    cruxFormFactor.value = 'phone'
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
type VitalKey = 'lcp' | 'cls' | 'tbt' | 'fcp' | 'si' | 'ttfb'

const vitalsThresholds: Record<VitalKey, { good: number, poor: number, unit: string, label: string, abbr: string, decimals?: number }> = {
  lcp: { good: 2500, poor: 4000, unit: 'ms', label: 'Largest Contentful Paint', abbr: 'LCP' },
  cls: { good: 0.1, poor: 0.25, unit: '', label: 'Cumulative Layout Shift', abbr: 'CLS', decimals: 3 },
  tbt: { good: 200, poor: 600, unit: 'ms', label: 'Total Blocking Time', abbr: 'TBT' },
  fcp: { good: 1800, poor: 3000, unit: 'ms', label: 'First Contentful Paint', abbr: 'FCP' },
  si: { good: 3400, poor: 5800, unit: 'ms', label: 'Speed Index', abbr: 'SI' },
  ttfb: { good: 800, poor: 1800, unit: 'ms', label: 'Time to First Byte', abbr: 'TTFB' },
}

const vitalKeys = Object.keys(vitalsThresholds) as VitalKey[]

function getVitalRating(value: number, metric: VitalKey) {
  const threshold = vitalsThresholds[metric]
  if (value <= threshold.good)
    return 'good'
  if (value <= threshold.poor)
    return 'needs-improvement'
  return 'poor'
}

function getVitalColor(rating: string) {
  if (rating === 'good')
    return 'text-success'
  if (rating === 'needs-improvement')
    return 'text-warning'
  return 'text-error'
}

function getVitalBg(rating: string) {
  if (rating === 'good')
    return 'bg-success/10 border-success/20'
  if (rating === 'needs-improvement')
    return 'bg-warning/10 border-warning/20'
  return 'bg-error/10 border-error/20'
}

// Calculate position on spectrum (0-100%)
function getSpectrumPosition(value: number, good: number, poor: number) {
  // Use a max of 2x poor threshold for the scale
  const max = poor * 2
  const position = Math.min((value / max) * 100, 100)
  return position
}

const webVitals = computed(() => {
  const routes = performance.data.value?.routes ?? []
  const withScores = routes.filter(r => r.score !== null)
  if (!withScores.length)
    return []

  const calcAvg = (key: string) => {
    const valid = withScores.filter(r => (r as any)[key] !== null && (r as any)[key] !== undefined)
    if (!valid.length)
      return null
    return valid.reduce((a, r) => a + ((r as any)[key] ?? 0), 0) / valid.length
  }

  return vitalKeys.map((key) => {
    const avg = calcAvg(key)
    if (avg === null)
      return null
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
  if (!withScores.length)
    return null
  return Math.round(withScores.reduce((a, r) => a + (r.score ?? 0), 0) / withScores.length)
})

const summaryStats = computed(() => {
  const routes = performance.data.value?.routes ?? []
  const withScores = routes.filter(r => r.score !== null)
  if (!withScores.length)
    return []

  const withLcp = withScores.filter(r => r.lcp)
  const withCls = withScores.filter(r => r.cls !== null)
  const withTbt = withScores.filter(r => r.tbt)

  const avgLcp = withLcp.length ? Math.round(withLcp.reduce((a, r) => a + (r.lcp ?? 0), 0) / withLcp.length) : null
  const avgCls = withCls.length ? (withCls.reduce((a, r) => a + (r.cls ?? 0), 0) / withCls.length).toFixed(3) : null
  const avgTbt = withTbt.length ? Math.round(withTbt.reduce((a, r) => a + (r.tbt ?? 0), 0) / withTbt.length) : null

  const lcpColor = avgLcp !== null ? (avgLcp <= 2500 ? 'text-success' : avgLcp <= 4000 ? 'text-warning' : 'text-error') : undefined
  const clsColor = avgCls !== null ? (Number(avgCls) <= 0.1 ? 'text-success' : Number(avgCls) <= 0.25 ? 'text-warning' : 'text-error') : undefined
  const tbtColor = avgTbt !== null ? (avgTbt <= 200 ? 'text-success' : avgTbt <= 600 ? 'text-warning' : 'text-error') : undefined

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

const topOpportunities = computed(() => {
  const issues = performance.data.value?.issues ?? []
  const groups = {
    'image': { icon: 'i-heroicons-photo', label: 'image optimization opportunities', color: 'text-muted', bg: 'bg-elevated/40 border-default' },
    'script': { icon: 'i-heroicons-code-bracket', label: 'unused JavaScript', color: 'text-muted', bg: 'bg-elevated/40 border-default' },
    'stylesheet': { icon: 'i-heroicons-paint-brush', label: 'unused CSS', color: 'text-muted', bg: 'bg-elevated/40 border-default' },
    'render-blocking': { icon: 'i-heroicons-no-symbol', label: 'render-blocking resources', color: 'text-error', bg: 'bg-error/5 border-error/20' },
    'font': { icon: 'i-heroicons-language', label: 'font issues', color: 'text-muted', bg: 'bg-elevated/40 border-default' },
  } as const

  const byType = new Map<string, { count: number, bytes: number, pages: Set<string> }>()
  for (const issue of issues) {
    const existing = byType.get(issue.type) ?? { count: 0, bytes: 0, pages: new Set<string>() }
    existing.count++
    existing.bytes += issue.wastedBytes ?? 0
    for (const p of issue.pages ?? []) existing.pages.add(p)
    byType.set(issue.type, existing)
  }

  return [...byType.entries()]
    .map(([type, stats]) => ({
      type,
      count: stats.count,
      bytes: stats.bytes,
      pageCount: stats.pages.size,
      ...(groups[type as keyof typeof groups] ?? { icon: 'i-heroicons-exclamation-triangle', label: type, color: 'text-muted', bg: 'bg-elevated/60 border-default' }),
    }))
    .sort((a, b) => b.bytes - a.bytes)
})

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
      color="text-success"
      :score="avgScore"
      :stats="summaryStats"
    />

    <!-- Tabs -->
    <div class="flex gap-2 mb-6 border-b border-default pb-4">
      <button
        v-for="(tab, idx) in tabs"
        :key="tab.label"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors"
        :class="activeTab === idx
          ? 'bg-elevated text-highlighted border border-default'
          : 'text-muted hover:text-default hover:bg-elevated/60 border border-transparent'"
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
      <div v-if="!webVitals.length" class="text-center py-8 text-dimmed">
        <UIcon name="i-heroicons-information-circle" class="w-8 h-8 mx-auto mb-2" />
        <p>No Web Vitals data available</p>
      </div>
      <div v-else class="space-y-6">
        <!-- Field data from CrUX -->
        <DashboardCard v-if="hasAnyCrux && cruxSeries" title="Field Data (CrUX)" icon="i-heroicons-globe-alt">
          <template #actions>
            <UTabs
              v-model="cruxFormFactor"
              size="xs"
              :items="[
                { label: 'Phone', value: 'phone', disabled: !hasPhoneCrux },
                { label: 'Desktop', value: 'desktop', disabled: !hasDesktopCrux },
              ]"
            />
          </template>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <CruxMetricCard metric="lcp" :history="cruxSeries.lcp" :loading="crux.status.value === 'pending'" />
            <CruxMetricCard metric="inp" :history="cruxSeries.inp" :loading="crux.status.value === 'pending'" />
            <CruxMetricCard metric="cls" :history="cruxSeries.cls" :loading="crux.status.value === 'pending'" />
          </div>
        </DashboardCard>

        <!-- Top Opportunities -->
        <DashboardCard v-if="topOpportunities.length" title="Top Opportunities" icon="i-heroicons-sparkles">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div
              v-for="op in topOpportunities"
              :key="op.type"
              class="flex items-center gap-3 px-4 py-3 rounded-lg border"
              :class="op.bg"
            >
              <UIcon :name="op.icon" class="w-5 h-5 shrink-0" :class="op.color" />
              <div class="min-w-0 flex-1">
                <div class="text-sm text-highlighted">
                  <span class="font-mono" :class="op.color">{{ op.count }}</span> {{ op.label }}
                </div>
                <div class="text-xs text-dimmed mt-0.5">
                  <span v-if="op.bytes > 0">Save ~{{ formatBytes(op.bytes) }} · </span>
                  across {{ op.pageCount }} {{ op.pageCount === 1 ? 'page' : 'pages' }}
                </div>
              </div>
            </div>
          </div>
        </DashboardCard>

        <!-- Core Web Vitals (LCP, CLS, TBT) -->
        <DashboardCard title="Core Web Vitals" icon="i-heroicons-chart-bar">
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div
              v-for="vital in webVitals.filter(v => ['lcp', 'cls', 'tbt'].includes(v.key))"
              :key="vital.key"
              class="rounded-xl border p-4"
              :class="getVitalBg(vital.rating)"
            >
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-muted">{{ vital.abbr }}</span>
                <span
                  class="text-xs px-2 py-0.5 rounded-full capitalize"
                  :class="[
                    getVitalColor(vital.rating),
                    vital.rating === 'good' ? 'bg-success/20' : vital.rating === 'needs-improvement' ? 'bg-warning/20' : 'bg-error/20',
                  ]"
                >
                  {{ vital.rating.replace('-', ' ') }}
                </span>
              </div>
              <div class="text-2xl font-mono font-bold mb-1" :class="getVitalColor(vital.rating)">
                {{ vital.value }}{{ vital.unit }}
              </div>
              <div class="text-xs text-dimmed mb-4">
                {{ vital.label }}
              </div>

              <!-- Threshold bar -->
              <div class="relative h-2 rounded-full overflow-hidden flex">
                <div class="bg-success/75 h-full" style="width: 25%" />
                <div class="bg-warning/75 h-full" style="width: 25%" />
                <div class="bg-error/75 h-full flex-1" />
                <!-- Marker for current value -->
                <div
                  class="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-inverted border-2"
                  :class="vital.rating === 'good' ? 'border-success' : vital.rating === 'needs-improvement' ? 'border-warning' : 'border-error'"
                  :style="{ left: `calc(${getSpectrumPosition(Number(vital.value), vital.good, vital.poor)}% - 6px)` }"
                />
              </div>
              <!-- Threshold labels -->
              <div class="flex justify-between mt-2 text-xs text-dimmed">
                <span>0</span>
                <span class="text-success">{{ vital.good }}{{ vital.unit }}</span>
                <span class="text-error">{{ vital.poor }}{{ vital.unit }}</span>
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
              class="rounded-xl border p-4"
              :class="getVitalBg(vital.rating)"
            >
              <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-medium text-muted">{{ vital.abbr }}</span>
                <span
                  class="text-xs px-2 py-0.5 rounded-full capitalize"
                  :class="[
                    getVitalColor(vital.rating),
                    vital.rating === 'good' ? 'bg-success/20' : vital.rating === 'needs-improvement' ? 'bg-warning/20' : 'bg-error/20',
                  ]"
                >
                  {{ vital.rating.replace('-', ' ') }}
                </span>
              </div>
              <div class="text-2xl font-mono font-bold mb-1" :class="getVitalColor(vital.rating)">
                {{ vital.value }}{{ vital.unit }}
              </div>
              <div class="text-xs text-dimmed mb-4">
                {{ vital.label }}
              </div>

              <!-- Threshold bar -->
              <div class="relative h-2 rounded-full overflow-hidden flex">
                <div class="bg-success/75 h-full" style="width: 25%" />
                <div class="bg-warning/75 h-full" style="width: 25%" />
                <div class="bg-error/75 h-full flex-1" />
                <!-- Marker for current value -->
                <div
                  class="absolute top-1/2 -translate-y-1/2 size-3 rounded-full bg-inverted border-2"
                  :class="vital.rating === 'good' ? 'border-success' : vital.rating === 'needs-improvement' ? 'border-warning' : 'border-error'"
                  :style="{ left: `calc(${getSpectrumPosition(Number(vital.value), vital.good, vital.poor)}% - 6px)` }"
                />
              </div>
              <!-- Threshold labels -->
              <div class="flex justify-between mt-2 text-xs text-dimmed">
                <span>0</span>
                <span class="text-success">{{ vital.good }}{{ vital.unit }}</span>
                <span class="text-error">{{ vital.poor }}{{ vital.unit }}</span>
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>

    <!-- Images Tab -->
    <div v-else-if="activeTab === 1">
      <DashboardCard title="Image Optimization Issues" icon="i-heroicons-photo" :count="sortedIssues.length">
        <div v-if="!sortedIssues.length" class="text-center py-8 text-dimmed">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-success" />
          <p>No image optimization issues found</p>
        </div>
        <div v-else class="divide-y divide-default">
          <div v-for="issue in sortedIssues" :key="issue.id" class="py-3 first:pt-0 last:pb-0">
            <div class="flex items-center justify-between gap-4">
              <div class="min-w-0 flex-1">
                <div class="text-sm text-highlighted font-mono truncate">
                  {{ issue.url }}
                </div>
                <div class="flex items-center gap-2 mt-1">
                  <span class="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">{{ issue.issueType }}</span>
                  <span class="text-xs text-dimmed">{{ issue.pages.length }} pages</span>
                </div>
              </div>
              <div class="text-right shrink-0">
                <div class="text-sm font-mono text-error">
                  {{ formatBytes(issue.wastedBytes) }}
                </div>
                <div v-if="issue.wastedMs" class="text-xs text-dimmed">
                  {{ formatMs(issue.wastedMs) }}
                </div>
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
        <div v-if="!sortedThirdParty.length" class="text-center py-8 text-dimmed">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-success" />
          <p>No third-party scripts detected</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-dimmed border-b border-default">
                <th class="pb-2 font-medium">
                  Entity
                </th>
                <th class="pb-2 font-medium text-right">
                  Avg TBT
                </th>
                <th class="pb-2 font-medium text-right">
                  Total TBT
                </th>
                <th class="pb-2 font-medium text-right">
                  Pages
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="tp in sortedThirdParty" :key="tp.entity">
                <td class="py-3 text-highlighted">
                  {{ tp.entity }}
                </td>
                <td class="py-3 text-right font-mono text-primary">
                  {{ formatMs(tp.avgTbt) }}
                </td>
                <td class="py-3 text-right font-mono text-error">
                  {{ formatMs(tp.totalTbt) }}
                </td>
                <td class="py-3 text-right text-muted">
                  {{ tp.pageCount }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>

    <!-- LCP Elements Tab -->
    <div v-else-if="activeTab === 3">
      <DashboardCard title="Largest Contentful Paint Elements" icon="i-heroicons-clock" :count="sortedLcp.length">
        <div v-if="!sortedLcp.length" class="text-center py-8 text-dimmed">
          <UIcon name="i-heroicons-information-circle" class="w-8 h-8 mx-auto mb-2" />
          <p>No LCP element data available</p>
        </div>
        <div v-else class="divide-y divide-default">
          <div v-for="lcp in sortedLcp" :key="lcp.selector" class="py-4 first:pt-0 last:pb-0">
            <div class="flex items-start gap-4">
              <!-- Element type icon -->
              <div
                class="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                :class="lcp.avgLcp > 2500 ? 'bg-error/10' : lcp.avgLcp > 1800 ? 'bg-warning/10' : 'bg-success/10'"
              >
                <UIcon
                  :name="lcp.elementType === 'image' ? 'i-heroicons-photo' : lcp.elementType === 'video' ? 'i-heroicons-video-camera' : 'i-heroicons-document-text'"
                  class="w-5 h-5"
                  :class="lcp.avgLcp > 2500 ? 'text-error' : lcp.avgLcp > 1800 ? 'text-warning' : 'text-success'"
                />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <span
                    class="text-xs px-2 py-0.5 rounded capitalize"
                    :class="lcp.elementType === 'image' ? 'bg-secondary/10 text-secondary border border-secondary/20' : lcp.elementType === 'video' ? 'bg-info/10 text-info border border-info/20' : 'bg-elevated/60 text-muted border border-default'"
                  >
                    {{ lcp.elementType || 'unknown' }}
                  </span>
                  <span class="text-xs text-dimmed">{{ lcp.pageCount }} page{{ lcp.pageCount !== 1 ? 's' : '' }}</span>
                </div>
                <div class="text-sm font-mono text-highlighted truncate" :title="lcp.selector">
                  {{ lcp.selector }}
                </div>
                <div class="flex items-center gap-4 mt-2">
                  <div class="text-sm">
                    <span class="text-dimmed">Avg LCP:</span>
                    <span
                      class="font-mono ml-1"
                      :class="lcp.avgLcp > 2500 ? 'text-error' : lcp.avgLcp > 1800 ? 'text-warning' : 'text-success'"
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
        <div v-if="!sortedRoutes.length" class="text-center py-8 text-dimmed">
          <UIcon name="i-heroicons-information-circle" class="w-8 h-8 mx-auto mb-2" />
          <p>No route data available</p>
        </div>
        <div v-else class="divide-y divide-default">
          <NuxtLink
            v-for="r in sortedRoutes"
            :key="r.path"
            :to="`/results/${scanId}?path=${encodeURIComponent(r.path)}`"
            class="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 hover:bg-elevated/40 -mx-4 px-4 transition-colors"
          >
            <div class="min-w-0 flex-1">
              <div class="text-sm font-mono text-highlighted truncate">
                {{ r.path }}
              </div>
              <div class="flex items-center gap-3 mt-1 text-xs text-dimmed">
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
