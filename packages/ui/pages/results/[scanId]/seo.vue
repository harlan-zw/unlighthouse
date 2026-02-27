<script setup lang="ts">
import { useDashboard, getScoreColor, getScoreBg } from '~/composables/dashboard'

definePageMeta({ layout: 'results' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)

const { seo } = useDashboard(scanId)

onMounted(() => {
  if (scanId.value) seo.execute()
})

const activeTab = ref(0)
const tabs = [
  { label: 'Meta Overview', icon: 'i-heroicons-document-text' },
  { label: 'Duplicates', icon: 'i-heroicons-document-duplicate' },
  { label: 'Issues', icon: 'i-heroicons-exclamation-triangle' },
  { label: 'Routes', icon: 'i-heroicons-queue-list' },
]

const avgScore = computed(() => {
  const routes = seo.data.value?.routes ?? []
  const withScores = routes.filter(r => r.score !== null)
  if (!withScores.length) return null
  return Math.round(withScores.reduce((a, r) => a + (r.score ?? 0), 0) / withScores.length)
})

const summaryStats = computed(() => {
  const meta = seo.data.value?.meta ?? []
  const duplicates = seo.data.value?.duplicates ?? []
  const routes = seo.data.value?.routes ?? []

  const withTitle = meta.filter(m => m.title).length
  const indexable = meta.filter(m => m.isIndexable).length
  const dupCount = duplicates.length

  return [
    { label: 'Pages', value: routes.length, icon: 'i-heroicons-document-text' },
    { label: 'With Title', value: withTitle, color: withTitle === meta.length ? 'text-green-400' : 'text-amber-400', icon: 'i-heroicons-tag' },
    { label: 'Indexable', value: indexable, icon: 'i-heroicons-magnifying-glass' },
    { label: 'Duplicates', value: dupCount, color: dupCount > 0 ? 'text-amber-400' : 'text-green-400', icon: 'i-heroicons-document-duplicate' },
  ]
})

// Meta overview sorted by issues (missing items first)
const sortedMeta = computed(() => {
  return [...(seo.data.value?.meta ?? [])].sort((a, b) => {
    // Count missing items
    const aMissing = [!a.title, !a.description, !a.canonical, !a.hasOgTags, !a.hasTwitterTags].filter(Boolean).length
    const bMissing = [!b.title, !b.description, !b.canonical, !b.hasOgTags, !b.hasTwitterTags].filter(Boolean).length
    return bMissing - aMissing
  })
})

// Duplicates grouped by type
const groupedDuplicates = computed(() => {
  const dups = seo.data.value?.duplicates ?? []
  const groups: Record<string, typeof dups> = {}
  for (const d of dups) {
    if (!groups[d.type]) groups[d.type] = []
    groups[d.type].push(d)
  }
  return groups
})

// Canonical chains
const canonicalChains = computed(() => seo.data.value?.canonicalChains ?? [])

// Link text issues
const linkTextIssues = computed(() =>
  [...(seo.data.value?.linkTextIssues ?? [])].sort((a, b) => b.instanceCount - a.instanceCount),
)

// Tap target issues
const tapTargetIssues = computed(() => seo.data.value?.tapTargetIssues ?? [])

// Routes sorted by score
const sortedRoutes = computed(() =>
  [...(seo.data.value?.routes ?? [])]
    .filter(r => r.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0)),
)

const expandedItems = ref<Record<string, boolean>>({})
function toggleItem(id: string) {
  expandedItems.value = { ...expandedItems.value, [id]: !expandedItems.value[id] }
}

function getTitleLengthColor(len: number | null): string {
  if (!len) return 'text-red-400'
  if (len >= 30 && len <= 60) return 'text-green-400'
  if (len >= 20 && len <= 70) return 'text-amber-400'
  return 'text-red-400'
}

function getDescLengthColor(len: number | null): string {
  if (!len) return 'text-red-400'
  if (len >= 120 && len <= 160) return 'text-green-400'
  if (len >= 70 && len <= 180) return 'text-amber-400'
  return 'text-red-400'
}
</script>

<template>
  <div>
    <DashboardHeader
      title="SEO"
      icon="i-heroicons-magnifying-glass"
      color="text-green-400"
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
          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
          : 'text-gray-400 hover:text-white hover:bg-white/5'"
        @click="activeTab = idx"
      >
        <UIcon :name="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Loading -->
    <div v-if="seo.status.value === 'pending'" class="space-y-4">
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
    </div>

    <!-- Meta Overview Tab -->
    <div v-else-if="activeTab === 0">
      <DashboardCard title="Meta Overview" icon="i-heroicons-document-text" :count="sortedMeta.length">
        <div v-if="!sortedMeta.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-information-circle" class="w-8 h-8 mx-auto mb-2" />
          <p>No meta data available</p>
        </div>
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-gray-500 border-b border-white/5">
                <th class="pb-2 font-medium">Path</th>
                <th class="pb-2 font-medium text-center">Title</th>
                <th class="pb-2 font-medium text-center">Desc</th>
                <th class="pb-2 font-medium text-center">Canon</th>
                <th class="pb-2 font-medium text-center">OG</th>
                <th class="pb-2 font-medium text-center">Twitter</th>
                <th class="pb-2 font-medium text-center">Schema</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              <tr
                v-for="m in sortedMeta"
                :key="m.path"
                class="hover:bg-white/[0.02] cursor-pointer"
                @click="toggleItem(`meta-${m.path}`)"
              >
                <td class="py-3 font-mono text-white truncate max-w-[150px]">{{ m.path }}</td>
                <td class="py-3 text-center">
                  <UIcon
                    :name="m.title ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="m.title ? 'text-green-400' : 'text-red-400'"
                    class="w-5 h-5"
                  />
                </td>
                <td class="py-3 text-center">
                  <UIcon
                    :name="m.description ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="m.description ? 'text-green-400' : 'text-red-400'"
                    class="w-5 h-5"
                  />
                </td>
                <td class="py-3 text-center">
                  <UIcon
                    :name="m.canonical ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="m.canonical ? 'text-green-400' : 'text-red-400'"
                    class="w-5 h-5"
                  />
                </td>
                <td class="py-3 text-center">
                  <UIcon
                    :name="m.hasOgTags ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="m.hasOgTags ? 'text-green-400' : 'text-gray-500'"
                    class="w-5 h-5"
                  />
                </td>
                <td class="py-3 text-center">
                  <UIcon
                    :name="m.hasTwitterTags ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="m.hasTwitterTags ? 'text-green-400' : 'text-gray-500'"
                    class="w-5 h-5"
                  />
                </td>
                <td class="py-3 text-center">
                  <UIcon
                    :name="m.structuredDataTypes?.length ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'"
                    :class="m.structuredDataTypes?.length ? 'text-green-400' : 'text-gray-500'"
                    class="w-5 h-5"
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Expanded meta details -->
        <div
          v-for="m in sortedMeta.filter(meta => expandedItems[`meta-${meta.path}`])"
          :key="`detail-${m.path}`"
          class="mt-4 p-4 bg-white/5 rounded-lg border border-white/5"
        >
          <h4 class="font-mono text-white mb-3">{{ m.path }}</h4>
          <dl class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div>
              <dt class="text-gray-500">Title</dt>
              <dd class="text-white">
                {{ m.title || '(missing)' }}
                <span v-if="m.titleLength" :class="getTitleLengthColor(m.titleLength)" class="ml-2 text-xs">
                  ({{ m.titleLength }} chars)
                </span>
              </dd>
            </div>
            <div>
              <dt class="text-gray-500">Description</dt>
              <dd class="text-white truncate">
                {{ m.description || '(missing)' }}
                <span v-if="m.descriptionLength" :class="getDescLengthColor(m.descriptionLength)" class="ml-2 text-xs">
                  ({{ m.descriptionLength }} chars)
                </span>
              </dd>
            </div>
            <div v-if="m.canonical">
              <dt class="text-gray-500">Canonical</dt>
              <dd class="font-mono text-white truncate">{{ m.canonical }}</dd>
            </div>
            <div v-if="m.structuredDataTypes?.length">
              <dt class="text-gray-500">Schema Types</dt>
              <dd class="flex flex-wrap gap-1">
                <span
                  v-for="t in m.structuredDataTypes"
                  :key="t"
                  class="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400"
                >
                  {{ t }}
                </span>
              </dd>
            </div>
            <div v-if="m.hreflangTags?.length">
              <dt class="text-gray-500">Hreflang</dt>
              <dd class="flex flex-wrap gap-1">
                <span
                  v-for="t in m.hreflangTags"
                  :key="t"
                  class="text-xs px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400"
                >
                  {{ t }}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      </DashboardCard>
    </div>

    <!-- Duplicates Tab -->
    <div v-else-if="activeTab === 1">
      <div class="space-y-6">
        <DashboardCard
          v-for="(dups, type) in groupedDuplicates"
          :key="type"
          :title="`Duplicate ${type}s`"
          icon="i-heroicons-document-duplicate"
          :count="dups.length"
        >
          <div class="divide-y divide-white/5 -mx-4">
            <div v-for="dup in dups" :key="`${type}-${dup.value}`" class="border-b border-white/5 last:border-0">
              <button
                class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                @click="toggleItem(`dup-${type}-${dup.value}`)"
              >
                <div class="flex items-center gap-3 min-w-0 flex-1">
                  <UIcon
                    :name="expandedItems[`dup-${type}-${dup.value}`] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                    class="w-4 h-4 text-gray-500 shrink-0"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="text-sm text-white truncate">"{{ dup.value }}"</div>
                    <div class="text-xs text-gray-500 mt-1">{{ dup.pageCount }} pages</div>
                  </div>
                </div>
                <span class="text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-400">
                  Duplicate
                </span>
              </button>
              <div v-if="expandedItems[`dup-${type}-${dup.value}`]" class="px-4 pb-4 pl-11">
                <PagesList :pages="dup.pages" />
              </div>
            </div>
          </div>
        </DashboardCard>

        <div v-if="!Object.keys(groupedDuplicates).length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No duplicate content found</p>
        </div>
      </div>
    </div>

    <!-- Issues Tab -->
    <div v-else-if="activeTab === 2">
      <div class="space-y-6">
        <!-- Canonical Chains -->
        <DashboardCard
          v-if="canonicalChains.length"
          title="Canonical Chains"
          icon="i-heroicons-link"
          :count="canonicalChains.length"
        >
          <div class="divide-y divide-white/5">
            <div v-for="(chain, idx) in canonicalChains" :key="idx" class="py-3 first:pt-0 last:pb-0">
              <div class="flex items-center gap-2">
                <span class="font-mono text-sm text-white">{{ chain.chain }}</span>
                <span
                  v-if="chain.isLoop"
                  class="text-xs px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20"
                >
                  Loop!
                </span>
              </div>
              <PagesList v-if="chain.pages?.length" :pages="chain.pages" class="mt-2" />
            </div>
          </div>
        </DashboardCard>

        <!-- Link Text Issues -->
        <DashboardCard
          v-if="linkTextIssues.length"
          title="Generic Link Text"
          icon="i-heroicons-cursor-arrow-ripple"
          :count="linkTextIssues.length"
        >
          <div class="divide-y divide-white/5 -mx-4">
            <div v-for="issue in linkTextIssues" :key="issue.text" class="border-b border-white/5 last:border-0">
              <button
                class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
                @click="toggleItem(`link-${issue.text}`)"
              >
                <div class="flex items-center gap-3 min-w-0 flex-1">
                  <UIcon
                    :name="expandedItems[`link-${issue.text}`] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                    class="w-4 h-4 text-gray-500 shrink-0"
                  />
                  <div class="min-w-0 flex-1">
                    <div class="text-sm text-amber-400">"{{ issue.text }}"</div>
                    <div class="text-xs text-gray-500 mt-1">
                      {{ issue.instanceCount }} instances on {{ issue.pageCount }} pages
                    </div>
                  </div>
                </div>
              </button>
              <div v-if="expandedItems[`link-${issue.text}`]" class="px-4 pb-4 pl-11">
                <PagesList :pages="issue.pages" />
              </div>
            </div>
          </div>
        </DashboardCard>

        <!-- Tap Target Issues -->
        <DashboardCard
          v-if="tapTargetIssues.length"
          title="Tap Target Issues"
          icon="i-heroicons-finger-print"
          :count="tapTargetIssues.length"
        >
          <div class="divide-y divide-white/5">
            <div v-for="issue in tapTargetIssues" :key="issue.path" class="py-3 first:pt-0 last:pb-0">
              <div class="flex items-center justify-between">
                <NuxtLink
                  :to="`/results/${scanId}?path=${encodeURIComponent(issue.path)}`"
                  class="font-mono text-sm text-white hover:text-green-400 transition-colors"
                >
                  {{ issue.path }}
                </NuxtLink>
                <span class="text-xs text-gray-400">{{ issue.elementCount }} elements</span>
              </div>
              <div v-if="issue.elements?.length" class="mt-2 flex flex-wrap gap-2">
                <span
                  v-for="el in issue.elements.slice(0, 5)"
                  :key="el.selector"
                  class="text-xs px-2 py-1 rounded bg-white/5 text-gray-400 font-mono"
                >
                  {{ el.selector }} ({{ el.size }})
                </span>
                <span v-if="issue.elements.length > 5" class="text-xs text-gray-500">
                  +{{ issue.elements.length - 5 }} more
                </span>
              </div>
            </div>
          </div>
        </DashboardCard>

        <div
          v-if="!canonicalChains.length && !linkTextIssues.length && !tapTargetIssues.length"
          class="text-center py-8 text-gray-500"
        >
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No SEO issues found</p>
        </div>
      </div>
    </div>

    <!-- Routes Tab -->
    <div v-else-if="activeTab === 3">
      <DashboardCard title="Routes by SEO Score" icon="i-heroicons-queue-list" :count="sortedRoutes.length">
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
