<script setup lang="ts">
import type { AccessibilityData } from '@unlighthouse/contracts'
import { withBase } from 'ufo'
import { useUnlighthouseConfig } from '~/composables/useUnlighthouseConfig'

const { apiUrl } = useUnlighthouseConfig()

definePageMeta({ layout: 'site' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)

// Get site URL from parent layout
const siteUrl = inject<ComputedRef<string>>('siteUrl', computed(() => ''))

const accessibility = useLazyFetch<AccessibilityData>(() =>
  scanId.value ? `${apiUrl.value}/dashboard/accessibility/${scanId.value}` : '', { immediate: false })

// Resolve image URLs against site
function resolveImageUrl(url: string): string {
  if (!url)
    return ''
  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//'))
    return url
  // Relative - resolve against site
  if (siteUrl.value)
    return withBase(url, siteUrl.value)
  return url
}

onMounted(() => {
  if (scanId.value)
    accessibility.execute()
})

const activeTab = ref(0)
const tabs = [
  { label: 'Issues', icon: 'i-heroicons-exclamation-triangle' },
  { label: 'Elements', icon: 'i-heroicons-code-bracket' },
  { label: 'Missing Alt', icon: 'i-heroicons-photo' },
  { label: 'Routes', icon: 'i-heroicons-queue-list' },
]

const severityOrder = { critical: 0, serious: 1, moderate: 2, minor: 3 }

const avgScore = computed(() => {
  const routes = accessibility.data.value?.routes ?? []
  const withScores = routes.filter(r => r.score !== null)
  if (!withScores.length)
    return null
  return Math.round(withScores.reduce((a, r) => a + (r.score ?? 0), 0) / withScores.length)
})

const summaryStats = computed(() => {
  const issues = accessibility.data.value?.issues ?? []
  const routes = accessibility.data.value?.routes ?? []

  const critical = issues.filter(i => i.severity === 'critical').length
  const serious = issues.filter(i => i.severity === 'serious').length
  const moderate = issues.filter(i => i.severity === 'moderate').length
  const totalIssues = issues.length

  return [
    { label: 'Pages', value: routes.length, icon: 'i-heroicons-document-text' },
    { label: 'Issues', value: totalIssues, color: totalIssues > 0 ? 'text-primary' : 'text-muted', icon: 'i-heroicons-exclamation-triangle' },
    { label: 'Critical', value: critical, color: critical > 0 ? 'text-error' : 'text-muted', icon: 'i-heroicons-x-circle' },
    { label: 'Serious', value: serious, color: serious > 0 ? 'text-error' : 'text-muted', icon: 'i-heroicons-exclamation-circle' },
  ]
})

const sortedIssues = computed(() =>
  [...(accessibility.data.value?.issues ?? [])]
    .sort((a, b) => {
      const sevDiff = (severityOrder[a.severity as keyof typeof severityOrder] ?? 4) - (severityOrder[b.severity as keyof typeof severityOrder] ?? 4)
      return sevDiff !== 0 ? sevDiff : b.instanceCount - a.instanceCount
    }),
)

const severityMeta = {
  critical: { label: 'Critical', hint: 'Blocks access entirely', color: 'text-error', bg: 'bg-error/80' },
  serious: { label: 'Serious', hint: 'Major barriers', color: 'text-error', bg: 'bg-error/60' },
  moderate: { label: 'Moderate', hint: 'Some difficulty', color: 'text-warning', bg: 'bg-warning/80' },
  minor: { label: 'Minor', hint: 'Low impact', color: 'text-info', bg: 'bg-info/80' },
} as const

const severityBreakdown = computed(() => {
  const issues = accessibility.data.value?.issues ?? []
  const totals: Record<keyof typeof severityMeta, number> = { critical: 0, serious: 0, moderate: 0, minor: 0 }
  for (const i of issues) {
    const key = i.severity as keyof typeof severityMeta
    if (key in totals)
      totals[key] += i.instanceCount
  }
  const total = Object.values(totals).reduce((a, b) => a + b, 0)
  return (Object.keys(severityMeta) as Array<keyof typeof severityMeta>).map(key => ({
    key,
    count: totals[key],
    pct: total ? (totals[key] / total) * 100 : 0,
    ...severityMeta[key],
  }))
})

const severityTotal = computed(() => severityBreakdown.value.reduce((a, b) => a + b.count, 0))

const issuesByType = computed(() => {
  const issues = sortedIssues.value
  const maxCount = Math.max(1, ...issues.map(i => i.instanceCount))
  return issues.slice(0, 8).map(i => ({
    auditId: i.auditId,
    title: i.title || auditTitles[i.auditId] || i.auditId,
    severity: i.severity,
    instanceCount: i.instanceCount,
    pageCount: i.pageCount,
    pct: (i.instanceCount / maxCount) * 100,
  }))
})

const sortedElements = computed(() =>
  [...(accessibility.data.value?.elements ?? [])].sort((a, b) => b.pageCount - a.pageCount),
)

const sortedAltImages = computed(() =>
  [...(accessibility.data.value?.missingAltImages ?? [])].sort((a, b) => b.pageCount - a.pageCount),
)

const issueCountsByPath = computed(() => {
  const issues = accessibility.data.value?.issues ?? []
  const map = new Map<string, { critical: number, serious: number, moderate: number, minor: number, total: number }>()
  for (const issue of issues) {
    const sev = issue.severity as keyof typeof severityMeta
    for (const path of issue.pages ?? []) {
      const existing = map.get(path) ?? { critical: 0, serious: 0, moderate: 0, minor: 0, total: 0 }
      if (sev in existing)
        (existing as any)[sev] += 1
      existing.total += 1
      map.set(path, existing)
    }
  }
  return map
})

const sortedRoutes = computed(() => {
  const counts = issueCountsByPath.value
  return [...(accessibility.data.value?.routes ?? [])]
    .filter(r => r.score !== null)
    .map(r => ({ ...r, issues: counts.get(r.path) }))
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0))
})

const expandedIssues = ref<Record<string, boolean>>({})
function toggleIssue(id: string) {
  expandedIssues.value = { ...expandedIssues.value, [id]: !expandedIssues.value[id] }
}

const expandedElements = ref<Record<string, boolean>>({})
function toggleElement(id: string) {
  expandedElements.value = { ...expandedElements.value, [id]: !expandedElements.value[id] }
}

// Group elements: contrast issues first, then others
const contrastElements = computed(() =>
  sortedElements.value.filter(el => el.auditId === 'color-contrast'),
)
const otherElements = computed(() =>
  sortedElements.value.filter(el => el.auditId !== 'color-contrast'),
)

// Get issue title for audit ID
const auditTitles: Record<string, string> = {
  'color-contrast': 'Color Contrast',
  'image-alt': 'Missing Alt Text',
  'label': 'Form Label',
  'button-name': 'Button Name',
  'link-name': 'Link Name',
  'html-has-lang': 'HTML Lang',
  'document-title': 'Document Title',
  'heading-order': 'Heading Order',
  'aria-allowed-attr': 'ARIA Attribute',
  'aria-hidden-focus': 'ARIA Hidden Focus',
  'aria-required-attr': 'ARIA Required',
  'aria-valid-attr': 'ARIA Valid',
  'meta-viewport': 'Meta Viewport',
  'tabindex': 'Tab Index',
}
</script>

<template>
  <div>
    <DashboardHeader
      title="Accessibility"
      icon="i-heroicons-eye"
      color="text-info"
      :score="avgScore"
      :stats="summaryStats"
    />

    <!-- Tabs -->
    <div class="flex gap-2 mb-6 border-b border-default pb-4">
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
    <div v-if="accessibility.status.value === 'pending'" class="space-y-4">
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
      <USkeleton class="h-16 w-full" />
    </div>

    <!-- Issues Tab -->
    <div v-else-if="activeTab === 0" class="space-y-6">
      <!-- Issues by Severity -->
      <DashboardCard v-if="severityTotal > 0" title="Issues by severity" icon="i-heroicons-chart-bar">
        <div class="space-y-4">
          <div class="h-3 rounded-full overflow-hidden flex bg-elevated/60">
            <div
              v-for="s in severityBreakdown.filter(s => s.count > 0)"
              :key="s.key"
              class="h-full"
              :class="s.bg"
              :style="{ width: `${s.pct}%` }"
              :title="`${s.label}: ${s.count}`"
            />
          </div>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div
              v-for="s in severityBreakdown"
              :key="s.key"
              class="flex items-center gap-3 px-3 py-2 rounded-sm bg-elevated/40 border border-default"
            >
              <div class="w-2.5 h-2.5 rounded-full shrink-0" :class="s.bg" />
              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium" :class="s.color">{{ s.label }}</span>
                  <span class="font-mono text-sm text-highlighted">{{ s.count }}</span>
                </div>
                <div class="text-xs text-dimmed mt-0.5">
                  {{ s.hint }}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardCard>

      <!-- Issues by Type -->
      <DashboardCard v-if="issuesByType.length" title="Issues by type" icon="i-heroicons-squares-2x2">
        <div class="space-y-2">
          <div v-for="t in issuesByType" :key="t.auditId" class="flex items-center gap-3">
            <div class="flex-1 min-w-0">
              <div class="flex items-center justify-between mb-1 gap-2">
                <span class="text-sm text-highlighted truncate">{{ t.title }}</span>
                <span class="text-xs text-dimmed font-mono shrink-0">{{ t.instanceCount }} · {{ t.pageCount }} pages</span>
              </div>
              <div class="h-1.5 rounded-full bg-elevated/60 overflow-hidden">
                <div
                  class="h-full rounded-full"
                  :class="(severityMeta as any)[t.severity]?.bg ?? 'bg-muted'"
                  :style="{ width: `${t.pct}%` }"
                />
              </div>
            </div>
            <SeverityBadge :severity="t.severity" class="shrink-0" />
          </div>
        </div>
      </DashboardCard>

      <DashboardCard title="Accessibility issues" icon="i-heroicons-exclamation-triangle" :count="sortedIssues.length">
        <div v-if="!sortedIssues.length" class="text-center py-8 text-dimmed">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-success" />
          <p>No accessibility issues found</p>
        </div>
        <div v-else class="divide-y divide-default -mx-4">
          <div v-for="issue in sortedIssues" :key="issue.auditId" class="border-b border-default last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-elevated/40 transition-colors"
              @click="toggleIssue(issue.auditId)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedIssues[issue.auditId] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-dimmed shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-highlighted">
                    {{ issue.title }}
                  </div>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs text-dimmed">{{ issue.instanceCount }} instances on {{ issue.pageCount }} pages</span>
                    <span
                      v-for="wcag in issue.wcagCriteria?.slice(0, 2)"
                      :key="wcag"
                      class="text-xs px-1.5 py-0.5 rounded bg-info/10 text-info border border-info/20"
                    >
                      {{ wcag }}
                    </span>
                  </div>
                </div>
              </div>
              <SeverityBadge :severity="issue.severity" class="shrink-0" />
            </button>
            <div v-if="expandedIssues[issue.auditId]" class="px-4 pb-4 pl-11">
              <p v-if="issue.description" class="text-xs text-muted mb-3">
                {{ issue.description }}
              </p>
              <PagesList :pages="issue.pages" />
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>

    <!-- Elements Tab -->
    <div v-else-if="activeTab === 1">
      <!-- Color Contrast Issues -->
      <DashboardCard
        v-if="contrastElements.length"
        title="Color contrast issues"
        icon="i-heroicons-eye-dropper"
        :count="contrastElements.length"
        class="mb-6"
      >
        <div class="divide-y divide-default -mx-4">
          <div v-for="el in contrastElements" :key="`contrast-${el.selector}`" class="border-b border-default last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-elevated/40 transition-colors"
              @click="toggleElement(`contrast-${el.selector}`)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedElements[`contrast-${el.selector}`] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-dimmed shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <!-- Color swatch preview -->
                  <div class="flex items-center gap-3">
                    <div
                      v-if="el.foregroundColor && el.backgroundColor"
                      class="px-2 py-1 rounded text-xs font-mono shrink-0"
                      :style="{
                        color: el.foregroundColor,
                        backgroundColor: el.backgroundColor,
                        border: '1px solid var(--ui-border)',
                      }"
                    >
                      Aa
                    </div>
                    <div class="text-sm font-mono text-highlighted truncate">
                      {{ el.selector }}
                    </div>
                  </div>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs text-dimmed">{{ el.pageCount }} pages</span>
                    <span
                      v-if="el.contrastRatio"
                      class="text-xs px-1.5 py-0.5 rounded bg-error/10 text-error border border-error/20"
                    >
                      {{ el.contrastRatio.toFixed(2) }}:1
                    </span>
                    <span
                      v-if="el.requiredRatio"
                      class="text-xs text-dimmed"
                    >
                      (needs {{ el.requiredRatio }}:1)
                    </span>
                  </div>
                </div>
              </div>
              <SeverityBadge :severity="el.severity" class="shrink-0" />
            </button>
            <div v-if="expandedElements[`contrast-${el.selector}`]" class="px-4 pb-4 pl-11">
              <!-- Element screenshot preview -->
              <div v-if="el.boundingRect && el.screenshotPage" class="mb-3 rounded overflow-hidden border border-default w-fit max-w-[300px] max-h-[150px]">
                <img
                  :src="`${apiUrl}/dashboard/screenshot/${scanId}/${encodeURIComponent(el.screenshotPage)}`"
                  :style="{
                    objectFit: 'none',
                    objectPosition: `-${el.boundingRect.left}px -${el.boundingRect.top}px`,
                    width: `${el.boundingRect.width}px`,
                    height: `${el.boundingRect.height}px`,
                  }"
                  loading="lazy"
                >
              </div>
              <!-- Color details -->
              <div v-if="el.foregroundColor || el.backgroundColor" class="flex items-center gap-4 mb-3 text-xs">
                <div v-if="el.foregroundColor" class="flex items-center gap-2">
                  <span class="text-dimmed">Foreground:</span>
                  <span
                    class="w-4 h-4 rounded border border-default"
                    :style="{ backgroundColor: el.foregroundColor }"
                  />
                  <span class="font-mono text-muted">{{ el.foregroundColor }}</span>
                </div>
                <div v-if="el.backgroundColor" class="flex items-center gap-2">
                  <span class="text-dimmed">Background:</span>
                  <span
                    class="w-4 h-4 rounded border border-default"
                    :style="{ backgroundColor: el.backgroundColor }"
                  />
                  <span class="font-mono text-muted">{{ el.backgroundColor }}</span>
                </div>
              </div>
              <div v-if="el.snippet" class="text-xs text-muted font-mono bg-elevated/60 p-2 rounded mb-3 overflow-x-auto">
                {{ el.snippet }}
              </div>
              <PagesList :pages="el.pages" />
            </div>
          </div>
        </div>
      </DashboardCard>

      <!-- Other Element Issues -->
      <DashboardCard
        title="Other element issues"
        icon="i-heroicons-code-bracket"
        :count="otherElements.length"
      >
        <div v-if="!sortedElements.length" class="text-center py-8 text-dimmed">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-success" />
          <p>No systemic element issues found</p>
        </div>
        <div v-else-if="!otherElements.length" class="text-center py-8 text-dimmed">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-success" />
          <p>No other element issues (only contrast issues found)</p>
        </div>
        <div v-else class="divide-y divide-default -mx-4">
          <div v-for="el in otherElements" :key="`other-${el.selector}`" class="border-b border-default last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-elevated/40 transition-colors"
              @click="toggleElement(`other-${el.selector}`)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedElements[`other-${el.selector}`] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-dimmed shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-mono text-highlighted truncate">
                    {{ el.selector }}
                  </div>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs text-dimmed">{{ el.pageCount }} pages</span>
                    <span class="text-xs px-1.5 py-0.5 rounded bg-info/10 text-info border border-info/20">
                      {{ auditTitles[el.auditId] || el.auditId }}
                    </span>
                  </div>
                </div>
              </div>
              <SeverityBadge :severity="el.severity" class="shrink-0" />
            </button>
            <div v-if="expandedElements[`other-${el.selector}`]" class="px-4 pb-4 pl-11">
              <!-- Element screenshot preview -->
              <div v-if="el.boundingRect && el.screenshotPage" class="mb-3 rounded overflow-hidden border border-default w-fit max-w-[300px] max-h-[150px]">
                <img
                  :src="`${apiUrl}/dashboard/screenshot/${scanId}/${encodeURIComponent(el.screenshotPage)}`"
                  :style="{
                    objectFit: 'none',
                    objectPosition: `-${el.boundingRect.left}px -${el.boundingRect.top}px`,
                    width: `${el.boundingRect.width}px`,
                    height: `${el.boundingRect.height}px`,
                  }"
                  loading="lazy"
                >
              </div>
              <p v-if="el.issueDescription" class="text-xs text-muted mb-3">
                {{ el.issueDescription }}
              </p>
              <div v-if="el.snippet" class="text-xs text-muted font-mono bg-elevated/60 p-2 rounded mb-3 overflow-x-auto">
                {{ el.snippet }}
              </div>
              <PagesList :pages="el.pages" />
            </div>
          </div>
        </div>
      </DashboardCard>
    </div>

    <!-- Missing Alt Tab -->
    <div v-else-if="activeTab === 2">
      <DashboardCard title="Images missing alt text" icon="i-heroicons-photo" :count="sortedAltImages.length">
        <div v-if="!sortedAltImages.length" class="text-center py-8 text-dimmed">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-success" />
          <p>All images have alt text</p>
        </div>
        <div v-else class="divide-y divide-default">
          <div v-for="img in sortedAltImages" :key="img.url" class="py-3 first:pt-0 last:pb-0">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded bg-elevated/60 overflow-hidden shrink-0">
                <img
                  :src="resolveImageUrl(img.url)"
                  :alt="img.url"
                  class="w-full h-full object-cover"
                  loading="lazy"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                >
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-mono text-highlighted truncate">
                  {{ img.url }}
                </div>
                <div class="flex items-center gap-2 mt-1">
                  <span
                    class="text-xs px-2 py-0.5 rounded"
                    :class="img.isDecorative ? 'bg-elevated/60 text-muted' : 'bg-primary/10 text-primary'"
                  >
                    {{ img.isDecorative ? 'Likely decorative' : 'Needs alt text' }}
                  </span>
                  <span class="text-xs text-dimmed">{{ img.pageCount }} pages</span>
                </div>
              </div>
            </div>
            <PagesList v-if="img.pages.length" :pages="img.pages" class="mt-2 ml-16" />
          </div>
        </div>
      </DashboardCard>
    </div>

    <!-- Routes Tab -->
    <div v-else-if="activeTab === 3">
      <DashboardCard title="Routes by accessibility score" icon="i-heroicons-queue-list" :count="sortedRoutes.length">
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
              <div v-if="r.issues" class="flex items-center gap-3 mt-1 text-xs">
                <span v-if="r.issues.critical" class="text-error">{{ r.issues.critical }} critical</span>
                <span v-if="r.issues.serious" class="text-error">{{ r.issues.serious }} serious</span>
                <span v-if="r.issues.moderate" class="text-warning">{{ r.issues.moderate }} moderate</span>
                <span v-if="r.issues.minor" class="text-info">{{ r.issues.minor }} minor</span>
                <span class="text-dimmed">{{ r.issues.total }} total</span>
              </div>
              <div v-else class="text-xs text-dimmed mt-1">
                No issues
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
