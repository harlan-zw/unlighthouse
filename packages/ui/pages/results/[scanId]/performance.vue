<script setup lang="ts">
import { useDashboard, getScoreColor, getScoreBg, formatMs } from '~/composables/dashboard'

definePageMeta({ layout: 'results' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)

const { performance } = useDashboard(scanId)

onMounted(() => {
  if (scanId.value) performance.execute()
})

const activeTab = ref(0)
const tabs = [
  { label: 'Images', icon: 'i-heroicons-photo' },
  { label: 'Third-Party', icon: 'i-heroicons-globe-alt' },
  { label: 'LCP Elements', icon: 'i-heroicons-cursor-arrow-rays' },
  { label: 'Routes', icon: 'i-heroicons-queue-list' },
]

const avgScore = computed(() => {
  const routes = performance.data.value?.routes ?? []
  const withScores = routes.filter(r => r.score !== null)
  if (!withScores.length) return null
  return Math.round(withScores.reduce((a, r) => a + (r.score ?? 0), 0) / withScores.length)
})

const avgMetrics = computed(() => {
  const routes = performance.data.value?.routes ?? []
  const withLcp = routes.filter(r => r.lcp !== null)
  const withCls = routes.filter(r => r.cls !== null)
  const withTbt = routes.filter(r => r.tbt !== null)

  return {
    lcp: withLcp.length ? withLcp.reduce((a, r) => a + (r.lcp ?? 0), 0) / withLcp.length : null,
    cls: withCls.length ? withCls.reduce((a, r) => a + (r.cls ?? 0), 0) / withCls.length : null,
    tbt: withTbt.length ? withTbt.reduce((a, r) => a + (r.tbt ?? 0), 0) / withTbt.length : null,
  }
})

const summaryStats = computed(() => {
  const routes = performance.data.value?.routes ?? []
  const issues = performance.data.value?.issues ?? []
  const thirdParty = performance.data.value?.thirdParty ?? []

  const totalWastedBytes = issues.reduce((a, i) => a + (i.wastedBytes ?? 0), 0)
  const totalWastedKb = Math.round(totalWastedBytes / 1024)

  return [
    { label: 'Pages', value: routes.length, icon: 'i-heroicons-document-text' },
    { label: 'Image Issues', value: issues.length, color: issues.length > 0 ? 'text-amber-400' : 'text-green-400', icon: 'i-heroicons-photo' },
    { label: 'Wasted KB', value: totalWastedKb > 0 ? `${totalWastedKb}KB` : '0', color: totalWastedKb > 100 ? 'text-red-400' : 'text-gray-400', icon: 'i-heroicons-archive-box' },
    { label: 'Third-Party', value: thirdParty.length, icon: 'i-heroicons-globe-alt' },
  ]
})

// Sort images by wasted bytes
const sortedIssues = computed(() =>
  [...(performance.data.value?.issues ?? [])].sort((a, b) => (b.wastedBytes ?? 0) - (a.wastedBytes ?? 0)),
)

// Sort third-party by total TBT
const sortedThirdParty = computed(() =>
  [...(performance.data.value?.thirdParty ?? [])].sort((a, b) => (b.totalTbt ?? 0) - (a.totalTbt ?? 0)),
)

// Sort LCP elements by avg LCP
const sortedLcpElements = computed(() =>
  [...(performance.data.value?.lcpElements ?? [])].sort((a, b) => (b.avgLcp ?? 0) - (a.avgLcp ?? 0)),
)

// Sort routes by score (worst first)
const sortedRoutes = computed(() =>
  [...(performance.data.value?.routes ?? [])]
    .filter(r => r.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0)),
)

const expandedItems = ref<Record<string, boolean>>({})
function toggleItem(id: string) {
  expandedItems.value = { ...expandedItems.value, [id]: !expandedItems.value[id] }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
}

function getIssueTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    resize: 'Resize',
    lazy: 'Lazy Load',
    format: 'Format',
    compress: 'Compress',
  }
  return labels[type] || type
}

function getLcpColor(ms: number): string {
  if (ms <= 2500) return 'text-green-400'
  if (ms <= 4000) return 'text-amber-400'
  return 'text-red-400'
}

function getClsColor(cls: number): string {
  if (cls <= 0.1) return 'text-green-400'
  if (cls <= 0.25) return 'text-amber-400'
  return 'text-red-400'
}

function getTbtColor(ms: number): string {
  if (ms <= 200) return 'text-green-400'
  if (ms <= 600) return 'text-amber-400'
  return 'text-red-400'
}
</script>

<template>
  <div>
    <DashboardHeader
      title="Performance"
      icon="i-heroicons-bolt"
      color="text-amber-400"
      :score="avgScore"
      :stats="summaryStats"
    />

    <!-- Avg Metrics Row -->
    <div v-if="avgMetrics.lcp || avgMetrics.cls || avgMetrics.tbt" class="flex flex-wrap gap-4 mb-6 text-sm">
      <div v-if="avgMetrics.lcp" class="flex items-center gap-2">
        <span class="text-gray-500">Avg LCP:</span>
        <span :class="getLcpColor(avgMetrics.lcp)" class="font-mono">{{ formatMs(avgMetrics.lcp) }}</span>
      </div>
      <div v-if="avgMetrics.cls" class="flex items-center gap-2">
        <span class="text-gray-500">Avg CLS:</span>
        <span :class="getClsColor(avgMetrics.cls)" class="font-mono">{{ avgMetrics.cls.toFixed(3) }}</span>
      </div>
      <div v-if="avgMetrics.tbt" class="flex items-center gap-2">
        <span class="text-gray-500">Avg TBT:</span>
        <span :class="getTbtColor(avgMetrics.tbt)" class="font-mono">{{ formatMs(avgMetrics.tbt) }}</span>
      </div>
    </div>

    <!-- Tabs -->
    <div class="flex flex-wrap gap-2 mb-6 border-b border-white/5 pb-4">
      <button
        v-for="(tab, idx) in tabs"
        :key="tab.label"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all"
        :class="activeTab === idx
          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
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

    <!-- Images Tab -->
    <div v-else-if="activeTab === 0">
      <DashboardCard title="Image Issues" icon="i-heroicons-photo" :count="sortedIssues.length">
        <div v-if="!sortedIssues.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No image optimization issues found</p>
        </div>
        <div v-else class="divide-y divide-white/5 -mx-4">
          <div v-for="issue in sortedIssues" :key="issue.id || issue.url" class="border-b border-white/5 last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              @click="toggleItem(issue.url)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedItems[issue.url] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-gray-500 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-mono text-white truncate">{{ issue.url }}</div>
                  <div class="flex items-center gap-2 mt-1">
                    <span
                      class="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20"
                    >
                      {{ getIssueTypeLabel(issue.issueType) }}
                    </span>
                    <span class="text-xs text-gray-500">{{ issue.pages?.length ?? 0 }} pages</span>
                  </div>
                </div>
              </div>
              <div class="flex items-center gap-4 shrink-0">
                <span v-if="issue.wastedBytes" class="font-mono text-red-400 text-sm">
                  -{{ formatBytes(issue.wastedBytes) }}
                </span>
                <span v-if="issue.wastedMs" class="font-mono text-amber-400 text-sm">
                  -{{ formatMs(issue.wastedMs) }}
                </span>
              </div>
            </button>
            <div v-if="expandedItems[issue.url]" class="px-4 pb-4 pl-11">
              <PagesList v-if="issue.pages?.length" :pages="issue.pages" />
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>

    <!-- Third-Party Tab -->
    <div v-else-if="activeTab === 1">
      <DashboardCard title="Third-Party Scripts" icon="i-heroicons-globe-alt" :count="sortedThirdParty.length">
        <div v-if="!sortedThirdParty.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No significant third-party impact detected</p>
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
                <td class="py-3 text-right font-mono" :class="getTbtColor(tp.avgTbt)">
                  {{ formatMs(tp.avgTbt) }}
                </td>
                <td class="py-3 text-right font-mono" :class="getTbtColor(tp.totalTbt / (tp.pageCount || 1))">
                  {{ formatMs(tp.totalTbt) }}
                </td>
                <td class="py-3 text-right text-gray-400">{{ tp.pageCount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>

    <!-- LCP Elements Tab -->
    <div v-else-if="activeTab === 2">
      <DashboardCard title="LCP Elements" icon="i-heroicons-cursor-arrow-rays" :count="sortedLcpElements.length">
        <div v-if="!sortedLcpElements.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-information-circle" class="w-8 h-8 mx-auto mb-2" />
          <p>No LCP element data available</p>
        </div>
        <div v-else class="divide-y divide-white/5 -mx-4">
          <div v-for="el in sortedLcpElements" :key="el.selector" class="border-b border-white/5 last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              @click="toggleItem(`lcp-${el.selector}`)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedItems[`lcp-${el.selector}`] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-gray-500 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-mono text-white truncate">{{ el.selector }}</div>
                  <div class="flex items-center gap-2 mt-1">
                    <span
                      class="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    >
                      {{ el.elementType }}
                    </span>
                    <span class="text-xs text-gray-500">{{ el.pageCount }} pages</span>
                  </div>
                </div>
              </div>
              <div class="font-mono text-sm" :class="getLcpColor(el.avgLcp)">
                {{ formatMs(el.avgLcp) }}
              </div>
            </button>
            <div v-if="expandedItems[`lcp-${el.selector}`]" class="px-4 pb-4 pl-11">
              <PagesList v-if="el.pages?.length" :pages="el.pages" />
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>

    <!-- Routes Tab -->
    <div v-else-if="activeTab === 3">
      <DashboardCard title="Routes by Performance Score" icon="i-heroicons-queue-list" :count="sortedRoutes.length">
        <div v-if="!sortedRoutes.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-information-circle" class="w-8 h-8 mx-auto mb-2" />
          <p>No route data available</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-white/5">
                <th class="pb-2 font-medium">Path</th>
                <th class="pb-2 font-medium text-right">Score</th>
                <th class="pb-2 font-medium text-right">LCP</th>
                <th class="pb-2 font-medium text-right">CLS</th>
                <th class="pb-2 font-medium text-right">TBT</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              <NuxtLink
                v-for="r in sortedRoutes"
                :key="r.path"
                :to="`/results/${scanId}?path=${encodeURIComponent(r.path)}`"
                class="table-row hover:bg-white/[0.02] transition-colors cursor-pointer"
              >
                <td class="py-3 font-mono text-white truncate max-w-[200px]">{{ r.path }}</td>
                <td class="py-3 text-right">
                  <span
                    class="inline-block w-10 h-10 rounded-lg text-center leading-10 font-mono font-bold"
                    :class="[getScoreBg(r.score), getScoreColor(r.score)]"
                  >
                    {{ r.score }}
                  </span>
                </td>
                <td class="py-3 text-right font-mono" :class="r.lcp !== null ? getLcpColor(r.lcp) : 'text-gray-500'">
                  {{ r.lcp !== null ? formatMs(r.lcp) : '-' }}
                </td>
                <td class="py-3 text-right font-mono" :class="r.cls !== null ? getClsColor(r.cls) : 'text-gray-500'">
                  {{ r.cls !== null ? r.cls.toFixed(3) : '-' }}
                </td>
                <td class="py-3 text-right font-mono" :class="r.tbt !== null ? getTbtColor(r.tbt) : 'text-gray-500'">
                  {{ r.tbt !== null ? formatMs(r.tbt) : '-' }}
                </td>
              </NuxtLink>
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>
  </div>
</template>
