<script setup lang="ts">
import type { SeoData } from '@unlighthouse/contracts'

definePageMeta({ layout: 'site' })

const route = useRoute()
const { apiUrl } = useUnlighthouseConfig()
const scanId = computed(() => route.params.scanId as string)

const seo = useLazyFetch<SeoData>(() =>
  scanId.value ? `${apiUrl.value}/dashboard/seo/${scanId.value}` : '', { immediate: false })

type SeoMeta = SeoData['meta'][number]

// Site URL for SERP preview; provided by the site layout's useHistoricalScan.
const siteUrl = inject<ComputedRef<string>>('siteUrl', computed(() => ''))

onMounted(() => {
  if (scanId.value)
    seo.execute()
})

// SERP preview helpers
function getSerpUrl(path: string) {
  if (!siteUrl.value)
    return path
  const url = new URL(path.startsWith('/') ? path : `/${path}`, siteUrl.value)
  return url.href
}

function getSerpDisplayUrl(path: string) {
  if (!siteUrl.value)
    return path
  const url = new URL(path.startsWith('/') ? path : `/${path}`, siteUrl.value)
  // Google shows: domain.com > path > segment
  const parts = url.pathname.split('/').filter(Boolean)
  if (parts.length === 0)
    return url.hostname
  return `${url.hostname} > ${parts.join(' > ')}`
}

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
  if (!withScores.length)
    return null
  return Math.round(withScores.reduce((a, r) => a + (r.score ?? 0), 0) / withScores.length)
})

const summaryStats = computed(() => {
  const data = seo.data.value
  if (!data)
    return []

  const meta = data.meta ?? []
  const duplicates = data.duplicates ?? []

  const withTitle = meta.filter(m => m.title).length
  const withDescription = meta.filter(m => m.description).length
  const indexable = meta.filter(m => m.isIndexable).length

  return [
    { label: 'Pages', value: meta.length, icon: 'i-heroicons-document-text' },
    { label: 'With Title', value: withTitle, color: withTitle === meta.length ? 'text-success' : 'text-warning', icon: 'i-heroicons-tag' },
    { label: 'Indexable', value: indexable, color: indexable === meta.length ? 'text-success' : 'text-warning', icon: 'i-heroicons-globe-alt' },
    { label: 'Duplicates', value: duplicates.length, color: duplicates.length > 0 ? 'text-primary' : 'text-muted', icon: 'i-heroicons-document-duplicate' },
  ]
})

function getTitleStatus(m: any): 'good' | 'warn' | 'bad' {
  if (!m.title)
    return 'bad'
  const length = m.titleLength ?? 0
  if (length < 30 || length > 60)
    return 'warn'
  return 'good'
}

function getDescStatus(m: any): 'good' | 'warn' | 'bad' {
  if (!m.description)
    return 'bad'
  const length = m.descriptionLength ?? 0
  if (length < 120 || length > 160)
    return 'warn'
  return 'good'
}

const statusColors = { good: 'text-success', warn: 'text-warning', bad: 'text-error' }
const statusIcons = { good: 'i-heroicons-check-circle', warn: 'i-heroicons-exclamation-circle', bad: 'i-heroicons-x-circle' }

const sortedMeta = computed(() =>
  [...(seo.data.value?.meta ?? [])].sort((a, b) => {
    const aScore = (a.title ? 0 : 1) + (a.description ? 0 : 1) + (a.hasOgTags ? 0 : 1)
    const bScore = (b.title ? 0 : 1) + (b.description ? 0 : 1) + (b.hasOgTags ? 0 : 1)
    return bScore - aScore
  }),
)

const schemaCoverage = computed(() => {
  const meta = seo.data.value?.meta ?? []
  const total = meta.length
  if (!total)
    return null

  const typeCounts = new Map<string, number>()
  let pagesWithSchema = 0
  for (const m of meta) {
    const types = m.structuredDataTypes ?? []
    if (types.length)
      pagesWithSchema++
    for (const t of types) typeCounts.set(t, (typeCounts.get(t) ?? 0) + 1)
  }

  const types = [...typeCounts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)

  return {
    pagesWithSchema,
    total,
    coverage: Math.round((pagesWithSchema / total) * 100),
    types,
  }
})

const healthChecks = computed(() => {
  const meta = seo.data.value?.meta ?? []
  const duplicates = seo.data.value?.duplicates ?? []
  const total = meta.length
  if (!total)
    return []

  const indexable = meta.filter(m => m.isIndexable).length
  const titleOk = meta.filter(m => m.title && m.titleLength != null && m.titleLength >= 30 && m.titleLength <= 60).length
  const descOk = meta.filter(m => m.description && m.descriptionLength != null && m.descriptionLength >= 120 && m.descriptionLength <= 160).length
  const canonical = meta.filter(m => m.canonical).length
  const og = meta.filter(m => m.hasOgTags).length
  const schema = meta.filter(m => (m.structuredDataTypes?.length ?? 0) > 0).length

  const titleDuplicates = duplicates.filter(d => d.type === 'title').length
  const descDuplicates = duplicates.filter(d => d.type === 'description').length

  const rate = (n: number) => Math.round((n / total) * 100)
  const statusFor = (ratio: number): 'pass' | 'warn' | 'fail' => ratio >= 95 ? 'pass' : ratio >= 70 ? 'warn' : 'fail'

  return [
    {
      key: 'index',
      label: 'Indexability',
      status: statusFor(rate(indexable)),
      detail: `${indexable}/${total} pages indexable${indexable < total ? ` · ${total - indexable} blocked/noindex` : ''}`,
    },
    {
      key: 'title',
      label: 'Title Tags',
      status: statusFor(rate(titleOk)),
      detail: `${titleOk}/${total} valid${titleDuplicates ? ` · ${titleDuplicates} duplicate` : ''}`,
    },
    {
      key: 'desc',
      label: 'Meta Descriptions',
      status: statusFor(rate(descOk)),
      detail: `${descOk}/${total} valid length${descDuplicates ? ` · ${descDuplicates} duplicate` : ''}`,
    },
    {
      key: 'canonical',
      label: 'Canonicals',
      status: statusFor(rate(canonical)),
      detail: `${canonical}/${total} pages (${rate(canonical)}%)`,
    },
    {
      key: 'og',
      label: 'Open Graph',
      status: statusFor(rate(og)),
      detail: `${og}/${total} pages (${rate(og)}%)`,
    },
    {
      key: 'schema',
      label: 'Structured Data',
      status: schema === 0 ? 'fail' : statusFor(rate(schema)),
      detail: schema === 0 ? 'No schema detected' : `${schema}/${total} pages (${rate(schema)}%)`,
    },
  ]
})

const sortedDuplicates = computed(() =>
  [...(seo.data.value?.duplicates ?? [])].sort((a, b) => b.pageCount - a.pageCount),
)

const metaByPath = computed(() => new Map((seo.data.value?.meta ?? []).map(m => [m.path, m])))

function summariseMetaIssues(m: any): string[] {
  const issues: string[] = []
  if (!m)
    return issues
  if (!m.isIndexable)
    issues.push('not indexable')
  if (!m.title)
    issues.push('no title')
  else if (m.titleLength == null || m.titleLength < 30 || m.titleLength > 60)
    issues.push('title length')
  if (!m.description)
    issues.push('no description')
  else if (m.descriptionLength == null || m.descriptionLength < 120 || m.descriptionLength > 160)
    issues.push('desc length')
  if (!m.canonical)
    issues.push('no canonical')
  if (!m.hasOgTags)
    issues.push('no OG')
  if (!(m.structuredDataTypes?.length))
    issues.push('no schema')
  return issues
}

const worstSeoPages = computed(() => {
  const meta = metaByPath.value
  return [...(seo.data.value?.routes ?? [])]
    .filter(r => r.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
    .slice(0, 5)
    .map(r => ({
      ...r,
      issues: summariseMetaIssues(meta.get(r.path)),
    }))
})

const sortedRoutes = computed(() => {
  const meta = metaByPath.value
  return [...(seo.data.value?.routes ?? [])]
    .filter(r => r.score !== null)
    .map(r => ({ ...r, issues: summariseMetaIssues(meta.get(r.path)) }))
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
})

const canonicalChains = computed(() => seo.data.value?.canonicalChains ?? [])
const linkTextIssues = computed(() =>
  [...(seo.data.value?.linkTextIssues ?? [])].sort((a, b) => b.instanceCount - a.instanceCount),
)
const tapTargetIssues = computed(() => seo.data.value?.tapTargetIssues ?? [])

const expandedItems = ref<Record<string, boolean>>({})
function toggleItem(id: string) {
  expandedItems.value = { ...expandedItems.value, [id]: !expandedItems.value[id] }
}

const expandedMeta = ref<string | null>(null)

// Social preview tabs - always default to Google (0)
const previewTabs = [
  { label: 'Google', icon: 'i-simple-icons-google', color: 'text-blue-500' },
  { label: 'X / Twitter', icon: 'i-simple-icons-x', color: 'text-default' },
  { label: 'Facebook', icon: 'i-simple-icons-facebook', color: 'text-blue-600' },
  { label: 'LinkedIn', icon: 'i-simple-icons-linkedin', color: 'text-blue-500' },
  { label: 'Slack', icon: 'i-simple-icons-slack', color: 'text-purple-400' },
  { label: 'Discord', icon: 'i-simple-icons-discord', color: 'text-indigo-400' },
]
const activePreviewTab = ref<Record<string, number>>({})
function getPreviewTab(path: string): number {
  // Always return 0 (Google) as default - ensures tab is visually selected
  if (!(path in activePreviewTab.value)) {
    activePreviewTab.value[path] = 0
  }
  return activePreviewTab.value[path] ?? 0
}
function setPreviewTab(path: string, idx: number) {
  activePreviewTab.value = { ...activePreviewTab.value, [path]: idx }
}

// Get hostname from site URL for social previews
const siteHostname = computed(() => {
  if (!siteUrl.value)
    return ''
  try { return new URL(siteUrl.value).hostname }
  catch { return '' }
})

function titleLength(m: SeoMeta): number {
  return m.titleLength ?? 0
}

function descriptionLength(m: SeoMeta): number {
  return m.descriptionLength ?? 0
}

function titleLengthClass(m: SeoMeta): string {
  const length = titleLength(m)
  return length < 30 ? 'bg-error/20 text-error' : length > 60 ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
}

function titleBarClass(m: SeoMeta): string {
  const length = titleLength(m)
  return length < 30 ? 'bg-error' : length > 60 ? 'bg-warning' : 'bg-success'
}

function descriptionLengthClass(m: SeoMeta): string {
  const length = descriptionLength(m)
  return length < 120 ? 'bg-error/20 text-error' : length > 160 ? 'bg-warning/20 text-warning' : 'bg-success/20 text-success'
}

function descriptionBarClass(m: SeoMeta): string {
  const length = descriptionLength(m)
  return length < 120 ? 'bg-error' : length > 160 ? 'bg-warning' : 'bg-success'
}

function titleBarWidth(m: SeoMeta): string {
  return `${Math.min(100, (titleLength(m) / 60) * 100)}%`
}

function descriptionBarWidth(m: SeoMeta): string {
  return `${Math.min(100, (descriptionLength(m) / 160) * 100)}%`
}

function firstString(...values: Array<string | null | undefined>): string | undefined {
  return values.find((value): value is string => !!value)
}

function fallbackString(...values: Array<string | null | undefined>): string {
  return firstString(...values) ?? ''
}
</script>

<template>
  <div>
    <DashboardHeader
      title="SEO"
      icon="i-heroicons-magnifying-glass"
      color="text-primary"
      :score="avgScore"
      :stats="summaryStats"
    />

    <!-- Tabs -->
    <div class="flex flex-wrap gap-2 mb-6 border-b border-default pb-4">
      <button
        v-for="(tab, idx) in tabs"
        :key="tab.label"
        class="flex items-center gap-2 px-4 py-2 rounded-sm text-sm transition-colors"
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
    <div v-if="seo.status.value === 'pending'" class="space-y-4">
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
    </div>

    <!-- Meta Overview Tab -->
    <div v-else-if="activeTab === 0" class="space-y-6">
      <DashboardCard v-if="healthChecks.length" title="SEO Health" icon="i-heroicons-heart">
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div
            v-for="item in healthChecks"
            :key="item.key"
            class="flex items-start gap-3 px-4 py-3 rounded-sm border"
            :class="{
              'bg-success/5 border-success/20': item.status === 'pass',
              'bg-warning/5 border-warning/20': item.status === 'warn',
              'bg-error/5 border-error/20': item.status === 'fail',
            }"
          >
            <UIcon
              :name="item.status === 'pass' ? 'i-heroicons-check-circle' : item.status === 'warn' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-x-circle'"
              class="w-5 h-5 shrink-0 mt-0.5"
              :class="{
                'text-success': item.status === 'pass',
                'text-warning': item.status === 'warn',
                'text-error': item.status === 'fail',
              }"
            />
            <div class="min-w-0 flex-1">
              <div class="text-sm font-medium text-highlighted">
                {{ item.label }}
              </div>
              <div class="text-xs text-muted mt-0.5">
                {{ item.detail }}
              </div>
            </div>
          </div>
        </div>
      </DashboardCard>

      <DashboardCard
        v-if="schemaCoverage"
        title="Structured data"
        icon="i-heroicons-code-bracket"
      >
        <div class="space-y-4">
          <div>
            <div class="flex items-center justify-between mb-2 text-sm">
              <span class="text-muted">Coverage</span>
              <span class="font-mono text-highlighted">{{ schemaCoverage.pagesWithSchema }}/{{ schemaCoverage.total }} pages ({{ schemaCoverage.coverage }}%)</span>
            </div>
            <div class="h-2 rounded-full bg-elevated/60 overflow-hidden">
              <div
                class="h-full rounded-full"
                :class="schemaCoverage.coverage >= 80 ? 'bg-success' : schemaCoverage.coverage >= 50 ? 'bg-warning' : 'bg-error'"
                :style="{ width: `${schemaCoverage.coverage}%` }"
              />
            </div>
          </div>
          <div v-if="schemaCoverage.types.length">
            <div class="text-xs text-dimmed mb-2 uppercase tracking-wider">
              Schema Types
            </div>
            <div class="flex flex-wrap gap-2">
              <span
                v-for="t in schemaCoverage.types"
                :key="t.name"
                class="text-xs px-2 py-1 rounded bg-info/10 text-info border border-info/20"
              >
                {{ t.name }}
                <span class="font-mono text-info/70 ml-1">({{ t.count }})</span>
              </span>
            </div>
          </div>
          <div v-else class="text-xs text-dimmed">
            No structured data detected on any page
          </div>
        </div>
      </DashboardCard>

      <DashboardCard
        v-if="worstSeoPages.length"
        title="Worst pages"
        icon="i-heroicons-arrow-trending-down"
      >
        <div class="divide-y divide-white/5">
          <NuxtLink
            v-for="r in worstSeoPages"
            :key="r.path"
            :to="`/results/${scanId}?path=${encodeURIComponent(r.path)}`"
            class="py-3 first:pt-0 last:pb-0 flex items-center justify-between gap-4 hover:bg-elevated/40 -mx-4 px-4 transition-colors"
          >
            <div class="min-w-0 flex-1">
              <div class="text-sm font-mono text-highlighted truncate">
                {{ r.path }}
              </div>
              <div v-if="r.issues.length" class="text-xs text-primary mt-1 truncate">
                {{ r.issues.join(' · ') }}
              </div>
              <div v-else class="text-xs text-success mt-1">
                All meta tags valid
              </div>
            </div>
            <div
              class="w-12 h-12 rounded-sm flex items-center justify-center font-mono font-bold shrink-0"
              :class="[getScoreBg(r.score), getScoreColor(r.score)]"
            >
              {{ r.score }}
            </div>
          </NuxtLink>
        </div>
      </DashboardCard>

      <DashboardCard title="Meta tags overview" icon="i-heroicons-document-text" :count="sortedMeta.length">
        <div v-if="!sortedMeta.length" class="text-center py-8 text-dimmed">
          <p>No meta data available</p>
        </div>
        <div v-else class="overflow-x-auto -mx-4">
          <table class="w-full text-sm min-w-[800px]">
            <thead>
              <tr class="text-left text-dimmed border-b border-default">
                <th class="pb-2 pl-4 font-medium">
                  Path
                </th>
                <th class="pb-2 font-medium text-center">
                  Title
                </th>
                <th class="pb-2 font-medium text-center">
                  Desc
                </th>
                <th class="pb-2 font-medium text-center">
                  Canon
                </th>
                <th class="pb-2 font-medium text-center">
                  OG
                </th>
                <th class="pb-2 font-medium text-center">
                  Twitter
                </th>
                <th class="pb-2 font-medium text-center">
                  Schema
                </th>
                <th class="pb-2 pr-4 font-medium text-center">
                  Index
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-white/5">
              <template v-for="m in sortedMeta" :key="m.path">
                <tr class="hover:bg-elevated/40 cursor-pointer" @click="expandedMeta = expandedMeta === m.path ? null : m.path">
                  <td class="py-3 pl-4 font-mono text-highlighted truncate max-w-[200px]">
                    {{ m.path }}
                  </td>
                  <td class="py-3 text-center">
                    <UIcon :name="statusIcons[getTitleStatus(m)]" class="w-5 h-5" :class="statusColors[getTitleStatus(m)]" />
                  </td>
                  <td class="py-3 text-center">
                    <UIcon :name="statusIcons[getDescStatus(m)]" class="w-5 h-5" :class="statusColors[getDescStatus(m)]" />
                  </td>
                  <td class="py-3 text-center">
                    <UIcon :name="m.canonical ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" class="w-5 h-5" :class="m.canonical ? 'text-success' : 'text-dimmed'" />
                  </td>
                  <td class="py-3 text-center">
                    <UIcon :name="m.hasOgTags ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" class="w-5 h-5" :class="m.hasOgTags ? 'text-success' : 'text-dimmed'" />
                  </td>
                  <td class="py-3 text-center">
                    <UIcon :name="m.hasTwitterTags ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" class="w-5 h-5" :class="m.hasTwitterTags ? 'text-success' : 'text-dimmed'" />
                  </td>
                  <td class="py-3 text-center">
                    <UIcon :name="m.structuredDataTypes?.length ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" class="w-5 h-5" :class="m.structuredDataTypes?.length ? 'text-success' : 'text-dimmed'" />
                  </td>
                  <td class="py-3 pr-4 text-center">
                    <UIcon :name="m.isIndexable ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" class="w-5 h-5" :class="m.isIndexable ? 'text-success' : 'text-error'" />
                  </td>
                </tr>
                <tr v-if="expandedMeta === m.path">
                  <td colspan="8" class="bg-elevated/40 px-4 py-4">
                    <div class="flex flex-wrap gap-8">
                      <!-- Title & Description (max 280px) -->
                      <div class="w-[280px] space-y-3">
                        <div>
                          <div class="flex items-center gap-2 mb-1">
                            <span class="text-dimmed text-xs">Title</span>
                            <span class="text-xs px-1.5 py-0.5 rounded" :class="titleLengthClass(m)">{{ titleLength(m) }}</span>
                          </div>
                          <div class="text-highlighted text-sm">
                            {{ m.title || '—' }}
                          </div>
                          <div class="h-1 rounded-full bg-elevated overflow-hidden mt-1.5">
                            <div class="h-full rounded-full" :class="titleBarClass(m)" :style="{ width: titleBarWidth(m) }" />
                          </div>
                        </div>
                        <div>
                          <div class="flex items-center gap-2 mb-1">
                            <span class="text-dimmed text-xs">Description</span>
                            <span class="text-xs px-1.5 py-0.5 rounded" :class="descriptionLengthClass(m)">{{ descriptionLength(m) }}</span>
                          </div>
                          <div class="text-highlighted text-sm">
                            {{ m.description || '—' }}
                          </div>
                          <div class="h-1 rounded-full bg-elevated overflow-hidden mt-1.5">
                            <div class="h-full rounded-full" :class="descriptionBarClass(m)" :style="{ width: descriptionBarWidth(m) }" />
                          </div>
                        </div>
                        <div class="flex flex-wrap items-center gap-2 pt-2 border-t border-default">
                          <div class="flex items-center gap-1 text-xs" :class="m.canonical ? 'text-success' : 'text-dimmed'">
                            <UIcon :name="m.canonical ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" class="w-3.5 h-3.5" />
                            <span>Canonical</span>
                          </div>
                          <div class="flex items-center gap-1 text-xs" :class="m.hasOgTags ? 'text-success' : 'text-error'">
                            <UIcon :name="m.hasOgTags ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" class="w-3.5 h-3.5" />
                            <span>OG</span>
                          </div>
                          <div class="flex items-center gap-1 text-xs" :class="m.hasTwitterTags ? 'text-success' : 'text-error'">
                            <UIcon :name="m.hasTwitterTags ? 'i-heroicons-check-circle' : 'i-heroicons-x-circle'" class="w-3.5 h-3.5" />
                            <span>Twitter</span>
                          </div>
                          <div v-if="m.structuredDataTypes?.length" class="flex items-center gap-1 text-xs text-info">
                            <UIcon name="i-heroicons-code-bracket" class="w-3.5 h-3.5" />
                            <span>Schema</span>
                          </div>
                        </div>
                      </div>

                      <!-- Social Share Preview (max 420px) -->
                      <div class="w-[420px]">
                        <div class="flex flex-wrap gap-1 mb-2">
                          <button
                            v-for="(tab, idx) in previewTabs"
                            :key="tab.label"
                            class="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-all"
                            :class="getPreviewTab(m.path) === idx ? 'bg-primary/20 text-primary' : 'text-dimmed hover:text-default hover:bg-elevated/60'"
                            @click="setPreviewTab(m.path, idx)"
                          >
                            <UIcon :name="tab.icon" class="w-3 h-3" />
                            {{ tab.label }}
                          </button>
                        </div>

                        <!-- Google Preview -->
                        <div v-if="getPreviewTab(m.path) === 0" class="p-3 rounded-sm bg-white max-w-[400px]">
                          <div class="text-[11px] text-[#202124] mb-0.5">
                            {{ getSerpDisplayUrl(m.path) }}
                          </div>
                          <a :href="getSerpUrl(m.path)" target="_blank" class="text-sm text-[#1a0dab] hover:underline leading-tight block mb-0.5">{{ m.ogTitle || m.title || 'No title' }}</a>
                          <p class="text-[11px] text-[#4d5156] line-clamp-2">
                            {{ m.ogDescription || m.description || 'No meta description set.' }}
                          </p>
                        </div>

                        <!-- X / Twitter Preview -->
                        <div v-else-if="getPreviewTab(m.path) === 1" class="rounded-sm overflow-hidden border border-gray-700 bg-black max-w-[400px]">
                          <div v-if="m.twitterImage || m.ogImage" class="aspect-[1.91/1] bg-gray-800">
                            <img :src="firstString(m.twitterImage, m.ogImage)" :alt="fallbackString(m.twitterTitle, m.ogTitle, m.title)" class="w-full h-full object-cover">
                          </div>
                          <div v-else class="h-[140px] bg-gray-800 flex items-center justify-center">
                            <UIcon name="i-heroicons-photo" class="w-8 h-8 text-dimmed" />
                          </div>
                          <div class="p-2">
                            <div class="text-[11px] text-dimmed">
                              {{ siteHostname }}
                            </div>
                            <div class="text-highlighted text-sm font-medium line-clamp-1">
                              {{ m.twitterTitle || m.ogTitle || m.title || 'No title' }}
                            </div>
                            <p class="text-[11px] text-dimmed line-clamp-2">
                              {{ m.twitterDescription || m.ogDescription || m.description || 'No description' }}
                            </p>
                          </div>
                        </div>

                        <!-- Facebook Preview -->
                        <div v-else-if="getPreviewTab(m.path) === 2" class="rounded overflow-hidden border border-gray-300 bg-white max-w-[400px]">
                          <div v-if="m.ogImage" class="aspect-[1.91/1] bg-gray-100">
                            <img :src="firstString(m.ogImage)" :alt="fallbackString(m.ogTitle, m.title)" class="w-full h-full object-cover">
                          </div>
                          <div v-else class="h-[140px] bg-gray-100 flex items-center justify-center">
                            <UIcon name="i-heroicons-photo" class="w-8 h-8 text-muted" />
                          </div>
                          <div class="p-2 bg-[#f2f3f5]">
                            <div class="text-[10px] text-[#606770] uppercase tracking-wide">
                              {{ siteHostname }}
                            </div>
                            <div class="text-[#1d2129] text-sm font-semibold line-clamp-1">
                              {{ m.ogTitle || m.title || 'No title' }}
                            </div>
                            <p class="text-[11px] text-[#606770] line-clamp-1">
                              {{ m.ogDescription || m.description || 'No description' }}
                            </p>
                          </div>
                        </div>

                        <!-- LinkedIn Preview -->
                        <div v-else-if="getPreviewTab(m.path) === 3" class="rounded overflow-hidden border border-gray-300 bg-white max-w-[400px]">
                          <div v-if="m.ogImage" class="aspect-[1.91/1] bg-gray-100">
                            <img :src="firstString(m.ogImage)" :alt="fallbackString(m.ogTitle, m.title)" class="w-full h-full object-cover">
                          </div>
                          <div v-else class="h-[140px] bg-gray-100 flex items-center justify-center">
                            <UIcon name="i-heroicons-photo" class="w-8 h-8 text-muted" />
                          </div>
                          <div class="p-2">
                            <div class="text-sm text-[#000000e6] font-semibold line-clamp-2">
                              {{ m.ogTitle || m.title || 'No title' }}
                            </div>
                            <div class="text-[11px] text-[#00000099]">
                              {{ siteHostname }}
                            </div>
                          </div>
                        </div>

                        <!-- Slack Preview -->
                        <div v-else-if="getPreviewTab(m.path) === 4" class="max-w-[400px]">
                          <div class="border-l-4 border-primary pl-2.5 py-1.5 bg-neutral-900 rounded-r">
                            <p class="text-sm font-semibold text-highlighted">
                              {{ siteHostname }}
                            </p>
                            <p class="text-sm text-blue-400">
                              {{ m.ogTitle || m.title || 'No title' }}
                            </p>
                            <p class="text-[11px] text-neutral-400 line-clamp-2">
                              {{ m.ogDescription || m.description || 'No description' }}
                            </p>
                            <div v-if="m.ogImage" class="mt-1.5 rounded overflow-hidden w-[180px]">
                              <img :src="firstString(m.ogImage)" :alt="fallbackString(m.ogTitle, m.title)" class="w-full h-auto">
                            </div>
                          </div>
                        </div>

                        <!-- Discord Preview -->
                        <div v-else-if="getPreviewTab(m.path) === 5" class="max-w-[400px]">
                          <div class="rounded border-l-4 border-indigo-500 bg-neutral-800 p-2.5">
                            <p class="text-[11px] text-neutral-400">
                              {{ siteHostname }}
                            </p>
                            <p class="text-sm font-semibold text-blue-400">
                              {{ m.ogTitle || m.title || 'No title' }}
                            </p>
                            <p class="text-[11px] text-neutral-300 line-clamp-3 mt-0.5">
                              {{ m.ogDescription || m.description || 'No description' }}
                            </p>
                            <div v-if="m.ogImage" class="mt-1.5 rounded overflow-hidden">
                              <img :src="firstString(m.ogImage)" :alt="fallbackString(m.ogTitle, m.title)" class="max-w-full max-h-40 rounded">
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              </template>
            </tbody>
          </table>
        </div>
      </DashboardCard>
    </div>

    <!-- Duplicates Tab -->
    <div v-else-if="activeTab === 1">
      <DashboardCard title="Duplicate meta tags" icon="i-heroicons-document-duplicate" :count="sortedDuplicates.length">
        <div v-if="!sortedDuplicates.length" class="text-center py-8 text-dimmed">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-success" />
          <p>No duplicate meta tags found</p>
        </div>
        <div v-else class="divide-y divide-white/5 -mx-4">
          <div v-for="(dup, idx) in sortedDuplicates" :key="idx" class="border-b border-default last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-elevated/40 transition-colors"
              @click="toggleItem(`dup-${idx}`)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedItems[`dup-${idx}`] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-dimmed shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2">
                    <span
                      class="text-xs px-2 py-0.5 rounded capitalize"
                      :class="dup.type === 'title' ? 'bg-primary/10 text-primary' : 'bg-info/10 text-info'"
                    >
                      {{ dup.type }}
                    </span>
                  </div>
                  <div class="text-sm text-highlighted mt-1 truncate">
                    "{{ dup.value }}"
                  </div>
                </div>
              </div>
              <span class="text-sm text-muted shrink-0">{{ dup.pageCount }} pages</span>
            </button>
            <div v-if="expandedItems[`dup-${idx}`]" class="px-4 pb-4 pl-11">
              <PagesList :pages="dup.pages" />
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>

    <!-- Issues Tab -->
    <div v-else-if="activeTab === 2">
      <div class="space-y-6">
        <DashboardCard title="Canonical chains" icon="i-heroicons-link" :count="canonicalChains.length">
          <div v-if="!canonicalChains.length" class="text-center py-8 text-dimmed">
            <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-success" />
            <p>No canonical chains found</p>
          </div>
          <div v-else class="divide-y divide-white/5">
            <div v-for="(chain, idx) in canonicalChains" :key="idx" class="py-3 first:pt-0 last:pb-0">
              <div class="flex items-center gap-2">
                <span class="text-sm font-mono text-toned">{{ chain.chain }}</span>
                <span v-if="chain.isLoop" class="text-xs px-2 py-0.5 rounded bg-error/10 text-error border border-error/20">Loop detected!</span>
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Generic link text" icon="i-heroicons-cursor-arrow-rays" :count="linkTextIssues.length">
          <div v-if="!linkTextIssues.length" class="text-center py-8 text-dimmed">
            <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-success" />
            <p>No generic link text found</p>
          </div>
          <div v-else class="divide-y divide-white/5 -mx-4">
            <div v-for="(issue, idx) in linkTextIssues" :key="idx" class="border-b border-default last:border-0">
              <button
                class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-elevated/40 transition-colors"
                @click="toggleItem(`link-${idx}`)"
              >
                <div class="flex items-center gap-3 min-w-0 flex-1">
                  <UIcon
                    :name="expandedItems[`link-${idx}`] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                    class="w-4 h-4 text-dimmed shrink-0"
                  />
                  <span class="text-sm text-primary">"{{ issue.text }}"</span>
                </div>
                <div class="flex items-center gap-4 shrink-0 text-sm">
                  <span class="font-mono text-muted">{{ issue.instanceCount }}x</span>
                  <span class="text-dimmed">{{ issue.pageCount }} pages</span>
                </div>
              </button>
              <div v-if="expandedItems[`link-${idx}`]" class="px-4 pb-4 pl-11">
                <PagesList :pages="issue.pages" />
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Tap target issues" icon="i-heroicons-finger-print" :count="tapTargetIssues.length">
          <div v-if="!tapTargetIssues.length" class="text-center py-8 text-dimmed">
            <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-success" />
            <p>No tap target issues found</p>
          </div>
          <div v-else class="divide-y divide-white/5">
            <div v-for="issue in tapTargetIssues" :key="issue.path" class="py-3 first:pt-0 last:pb-0">
              <div class="flex items-center justify-between">
                <NuxtLink
                  :to="`/results/${scanId}?path=${encodeURIComponent(issue.path)}`"
                  class="text-sm font-mono text-highlighted hover:text-primary transition-colors"
                >
                  {{ issue.path }}
                </NuxtLink>
                <span class="text-sm text-muted">{{ issue.elementCount }} elements too small</span>
              </div>
              <div v-if="issue.elements?.length" class="mt-2 flex flex-wrap gap-2">
                <span v-for="(el, idx) in issue.elements.slice(0, 5)" :key="idx" class="text-xs font-mono px-2 py-1 rounded bg-elevated/60 text-muted">
                  {{ el.selector }} ({{ el.size }})
                </span>
                <span v-if="issue.elements.length > 5" class="text-xs text-dimmed">+{{ issue.elements.length - 5 }} more</span>
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>
    </div>

    <!-- Routes Tab -->
    <div v-else-if="activeTab === 3">
      <DashboardCard title="Routes by SEO Score" icon="i-heroicons-queue-list" :count="sortedRoutes.length">
        <div v-if="!sortedRoutes.length" class="text-center py-8 text-dimmed">
          <UIcon name="i-heroicons-information-circle" class="w-8 h-8 mx-auto mb-2" />
          <p>No route data available</p>
        </div>
        <div v-else class="divide-y divide-white/5">
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
              <div v-if="r.issues.length" class="text-xs text-primary mt-1 truncate">
                {{ r.issues.join(' · ') }}
              </div>
              <div v-else class="text-xs text-success mt-1">
                All meta tags valid
              </div>
            </div>
            <div
              class="w-12 h-12 rounded-sm flex items-center justify-center font-mono font-bold shrink-0"
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
