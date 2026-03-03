<script setup lang="ts">
import { useDashboard, getScoreColor, getScoreBg } from '~/composables/dashboard'

definePageMeta({ layout: 'results' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)

const { bestPractices } = useDashboard(scanId)

onMounted(() => {
  if (scanId.value) bestPractices.execute()
})

const activeTab = ref(0)
const tabs = [
  { label: 'Security', icon: 'i-heroicons-shield-exclamation' },
  { label: 'Console Errors', icon: 'i-heroicons-command-line' },
  { label: 'Libraries', icon: 'i-heroicons-cube' },
  { label: 'Deprecated APIs', icon: 'i-heroicons-archive-box-x-mark' },
  { label: 'Routes', icon: 'i-heroicons-queue-list' },
]

const avgScore = computed(() => {
  const routes = bestPractices.data.value?.routes ?? []
  const withScores = routes.filter(r => r.score !== null)
  if (!withScores.length) return null
  return Math.round(withScores.reduce((a, r) => a + (r.score ?? 0), 0) / withScores.length)
})

const summaryStats = computed(() => {
  const data = bestPractices.data.value
  if (!data) return []

  const routes = data.routes ?? []
  const securityCount = data.securityIssues?.length ?? 0
  const errorCount = data.consoleErrors?.reduce((a, e) => a + e.instanceCount, 0) ?? 0
  const vulnerableCount = data.vulnerableLibraries?.length ?? 0
  const libraryCount = data.libraries?.length ?? 0

  return [
    { label: 'Pages', value: routes.length, icon: 'i-heroicons-document-text' },
    { label: 'Security Issues', value: securityCount, color: securityCount > 0 ? 'text-red-400' : 'text-green-400', icon: 'i-heroicons-shield-exclamation' },
    { label: 'Console Errors', value: errorCount, color: errorCount > 0 ? 'text-amber-400' : 'text-green-400', icon: 'i-heroicons-command-line' },
    { label: 'Vulnerable Libs', value: vulnerableCount, color: vulnerableCount > 0 ? 'text-red-400' : 'text-green-400', icon: 'i-heroicons-exclamation-triangle' },
  ]
})


const severityOrder = { high: 0, medium: 1, low: 2 }
const sortedSecurity = computed(() =>
  [...(bestPractices.data.value?.securityIssues ?? [])]
    .sort((a, b) => (severityOrder[a.severity as keyof typeof severityOrder] ?? 3) - (severityOrder[b.severity as keyof typeof severityOrder] ?? 3)),
)

const sortedErrors = computed(() =>
  [...(bestPractices.data.value?.consoleErrors ?? [])].sort((a, b) => b.instanceCount - a.instanceCount),
)

const libraryGroups = computed(() => {
  const libs = bestPractices.data.value?.libraries ?? []
  const vulnerable = bestPractices.data.value?.vulnerableLibraries ?? []
  const vulnMap = new Map(vulnerable.map(v => [v.name, v]))

  return {
    vulnerable: libs.filter(l => vulnMap.has(l.name)).map(l => ({ ...l, vulnInfo: vulnMap.get(l.name) })),
    outdated: libs.filter(l => l.status === 'outdated' && !vulnMap.has(l.name)),
    current: libs.filter(l => l.status === 'current' && !vulnMap.has(l.name)),
  }
})

const sortedDeprecated = computed(() =>
  [...(bestPractices.data.value?.deprecatedApis ?? [])].sort((a, b) => b.pageCount - a.pageCount),
)

const sortedRoutes = computed(() =>
  [...(bestPractices.data.value?.routes ?? [])]
    .filter(r => r.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0)),
)

const expandedItems = ref<Record<string, boolean>>({})
function toggleItem(id: string) {
  expandedItems.value = { ...expandedItems.value, [id]: !expandedItems.value[id] }
}
</script>

<template>
  <div>
    <DashboardHeader
      title="Best Practices"
      icon="i-heroicons-shield-check"
      color="text-purple-400"
      :score="avgScore"
      :stats="summaryStats"
    />

    <!-- Tabs -->
    <div class="flex flex-wrap gap-2 mb-6 border-b border-white/5 pb-4">
      <button
        v-for="(tab, idx) in tabs"
        :key="tab.label"
        class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all"
        :class="activeTab === idx
          ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
          : 'text-gray-400 hover:text-white hover:bg-white/5'"
        @click="activeTab = idx"
      >
        <UIcon :name="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="bestPractices.status.value === 'pending'" class="space-y-4">
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
    </div>

    <!-- Security Tab -->
    <div v-else-if="activeTab === 0">
      <DashboardCard title="Security Issues" icon="i-heroicons-shield-exclamation" :count="sortedSecurity.length">
        <div v-if="!sortedSecurity.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No security issues found</p>
        </div>
        <div v-else class="divide-y divide-white/5 -mx-4">
          <div v-for="issue in sortedSecurity" :key="issue.type" class="border-b border-white/5 last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              @click="toggleItem(issue.type)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedItems[issue.type] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-gray-500 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-white">{{ issue.type }}</div>
                  <div class="text-xs text-gray-500 mt-1">{{ issue.description }}</div>
                </div>
              </div>
              <div class="flex items-center gap-3 shrink-0">
                <SeverityBadge :severity="issue.severity === 'high' ? 'critical' : issue.severity === 'medium' ? 'serious' : 'moderate'" />
                <span class="text-xs text-gray-400">{{ issue.pageCount }} pages</span>
              </div>
            </button>
            <div v-if="expandedItems[issue.type]" class="px-4 pb-4 pl-11">
              <PagesList :pages="issue.pages" />
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>

    <!-- Console Errors Tab -->
    <div v-else-if="activeTab === 1">
      <DashboardCard title="Console Errors" icon="i-heroicons-command-line" :count="sortedErrors.length">
        <div v-if="!sortedErrors.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No console errors found</p>
        </div>
        <div v-else class="divide-y divide-white/5 -mx-4">
          <div v-for="(error, idx) in sortedErrors" :key="idx" class="border-b border-white/5 last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              @click="toggleItem(`error-${idx}`)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedItems[`error-${idx}`] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-gray-500 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-red-400 font-mono truncate">{{ error.message }}</div>
                  <div class="text-xs text-gray-500 mt-1">Source: {{ error.source }}</div>
                </div>
              </div>
              <div class="flex items-center gap-4 shrink-0 text-sm">
                <span class="font-mono text-amber-400">{{ error.instanceCount }}x</span>
                <span class="text-gray-400">{{ error.pageCount }} pages</span>
              </div>
            </button>
            <div v-if="expandedItems[`error-${idx}`]" class="px-4 pb-4 pl-11">
              <PagesList :pages="error.pages" />
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>

    <!-- Libraries Tab -->
    <div v-else-if="activeTab === 2">
      <div class="space-y-6">
        <DashboardCard
          v-if="libraryGroups.vulnerable.length"
          title="Vulnerable Libraries"
          icon="i-heroicons-exclamation-triangle"
          :count="libraryGroups.vulnerable.length"
        >
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500 border-b border-white/5">
                  <th class="pb-2 font-medium">Library</th>
                  <th class="pb-2 font-medium">Version</th>
                  <th class="pb-2 font-medium">Severity</th>
                  <th class="pb-2 font-medium">CVEs</th>
                  <th class="pb-2 font-medium text-right">Pages</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                <tr v-for="lib in libraryGroups.vulnerable" :key="lib.name">
                  <td class="py-3 text-white font-medium">{{ lib.name }}</td>
                  <td class="py-3 font-mono text-gray-400">{{ lib.version }}</td>
                  <td class="py-3">
                    <SeverityBadge :severity="lib.vulnInfo?.highestSeverity || 'moderate'" />
                  </td>
                  <td class="py-3">
                    <div class="flex flex-wrap gap-1">
                      <a
                        v-for="cve in lib.vulnInfo?.cves?.slice(0, 3)"
                        :key="cve"
                        :href="`https://nvd.nist.gov/vuln/detail/${cve}`"
                        target="_blank"
                        class="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
                      >
                        {{ cve }}
                      </a>
                      <span v-if="(lib.vulnInfo?.cves?.length ?? 0) > 3" class="text-xs text-gray-500">
                        +{{ (lib.vulnInfo?.cves?.length ?? 0) - 3 }} more
                      </span>
                    </div>
                  </td>
                  <td class="py-3 text-right text-gray-400">{{ lib.pageCount }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </DashboardCard>

        <DashboardCard
          title="Detected Libraries"
          icon="i-heroicons-cube"
          :count="(libraryGroups.outdated.length + libraryGroups.current.length)"
        >
          <div v-if="!libraryGroups.outdated.length && !libraryGroups.current.length" class="text-center py-8 text-gray-500">
            <p>No libraries detected</p>
          </div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-gray-500 border-b border-white/5">
                  <th class="pb-2 font-medium">Library</th>
                  <th class="pb-2 font-medium">Version</th>
                  <th class="pb-2 font-medium">Status</th>
                  <th class="pb-2 font-medium text-right">Pages</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                <tr v-for="lib in [...libraryGroups.outdated, ...libraryGroups.current]" :key="lib.name">
                  <td class="py-3 text-white">{{ lib.name }}</td>
                  <td class="py-3 font-mono text-gray-400">{{ lib.version }}</td>
                  <td class="py-3">
                    <span
                      class="text-xs px-2 py-0.5 rounded"
                      :class="lib.status === 'current' ? 'bg-green-500/10 text-green-400' : 'bg-amber-500/10 text-amber-400'"
                    >
                      {{ lib.status === 'current' ? '✓ Current' : '⚠ Outdated' }}
                    </span>
                  </td>
                  <td class="py-3 text-right text-gray-400">{{ lib.pageCount }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </DashboardCard>
      </div>
    </div>

    <!-- Deprecated APIs Tab -->
    <div v-else-if="activeTab === 3">
      <DashboardCard title="Deprecated APIs" icon="i-heroicons-archive-box-x-mark" :count="sortedDeprecated.length">
        <div v-if="!sortedDeprecated.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No deprecated APIs detected</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-white/5">
                <th class="pb-2 font-medium">API</th>
                <th class="pb-2 font-medium">Source</th>
                <th class="pb-2 font-medium text-right">Pages</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              <tr v-for="api in sortedDeprecated" :key="api.api">
                <td class="py-3 font-mono text-amber-400">{{ api.api }}</td>
                <td class="py-3 text-gray-400">{{ api.source }}</td>
                <td class="py-3 text-right text-gray-400">{{ api.pageCount }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>

    <!-- Routes Tab -->
    <div v-else-if="activeTab === 4">
      <DashboardCard title="Routes by Best Practices Score" icon="i-heroicons-queue-list" :count="sortedRoutes.length">
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
            <div class="text-sm font-mono text-white truncate">{{ r.path }}</div>
            <div
              class="w-12 h-12 rounded-lg flex items-center justify-center font-mono font-bold shrink-0"
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
