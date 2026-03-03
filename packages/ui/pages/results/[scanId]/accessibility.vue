<script setup lang="ts">
import { useDashboard, getScoreColor, getScoreBg } from '~/composables/dashboard'
import { withBase } from 'ufo'

definePageMeta({ layout: 'results' })

const route = useRoute()
const scanId = computed(() => route.params.scanId as string)

// Get site URL from parent layout
const siteUrl = inject<ComputedRef<string>>('siteUrl', computed(() => ''))

const { accessibility } = useDashboard(scanId)

// Resolve image URLs against site
function resolveImageUrl(url: string): string {
  if (!url) return ''
  // Already absolute
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('//'))
    return url
  // Relative - resolve against site
  if (siteUrl.value)
    return withBase(url, siteUrl.value)
  return url
}

onMounted(() => {
  if (scanId.value) accessibility.execute()
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
  if (!withScores.length) return null
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
    { label: 'Issues', value: totalIssues, color: totalIssues > 0 ? 'text-amber-400' : 'text-gray-400', icon: 'i-heroicons-exclamation-triangle' },
    { label: 'Critical', value: critical, color: critical > 0 ? 'text-red-400' : 'text-gray-400', icon: 'i-heroicons-x-circle' },
    { label: 'Serious', value: serious, color: serious > 0 ? 'text-orange-400' : 'text-gray-400', icon: 'i-heroicons-exclamation-circle' },
  ]
})


const sortedIssues = computed(() =>
  [...(accessibility.data.value?.issues ?? [])]
    .sort((a, b) => {
      const sevDiff = (severityOrder[a.severity as keyof typeof severityOrder] ?? 4) - (severityOrder[b.severity as keyof typeof severityOrder] ?? 4)
      return sevDiff !== 0 ? sevDiff : b.instanceCount - a.instanceCount
    }),
)

const sortedElements = computed(() =>
  [...(accessibility.data.value?.elements ?? [])].sort((a, b) => b.pageCount - a.pageCount),
)

const sortedAltImages = computed(() =>
  [...(accessibility.data.value?.missingAltImages ?? [])].sort((a, b) => b.pageCount - a.pageCount),
)

const sortedRoutes = computed(() =>
  [...(accessibility.data.value?.routes ?? [])]
    .filter(r => r.score !== null)
    .sort((a, b) => (a.score ?? 0) - (b.score ?? 0)),
)

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
      color="text-blue-400"
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
          ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
          : 'text-gray-400 hover:text-white hover:bg-white/5'"
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
    <div v-else-if="activeTab === 0">
      <DashboardCard title="Accessibility Issues" icon="i-heroicons-exclamation-triangle" :count="sortedIssues.length">
        <div v-if="!sortedIssues.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No accessibility issues found</p>
        </div>
        <div v-else class="divide-y divide-white/5 -mx-4">
          <div v-for="issue in sortedIssues" :key="issue.auditId" class="border-b border-white/5 last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              @click="toggleIssue(issue.auditId)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedIssues[issue.auditId] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-gray-500 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm text-white">{{ issue.title }}</div>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs text-gray-500">{{ issue.instanceCount }} instances on {{ issue.pageCount }} pages</span>
                    <span
                      v-for="wcag in issue.wcagCriteria?.slice(0, 2)"
                      :key="wcag"
                      class="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20"
                    >
                      {{ wcag }}
                    </span>
                  </div>
                </div>
              </div>
              <SeverityBadge :severity="issue.severity" class="shrink-0" />
            </button>
            <div v-if="expandedIssues[issue.auditId]" class="px-4 pb-4 pl-11">
              <p v-if="issue.description" class="text-xs text-gray-400 mb-3">{{ issue.description }}</p>
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
        title="Color Contrast Issues"
        icon="i-heroicons-eye-dropper"
        :count="contrastElements.length"
        class="mb-6"
      >
        <div class="divide-y divide-white/5 -mx-4">
          <div v-for="el in contrastElements" :key="`contrast-${el.selector}`" class="border-b border-white/5 last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              @click="toggleElement(`contrast-${el.selector}`)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedElements[`contrast-${el.selector}`] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-gray-500 shrink-0"
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
                        border: '1px solid rgba(255,255,255,0.1)',
                      }"
                    >
                      Aa
                    </div>
                    <div class="text-sm font-mono text-white truncate">{{ el.selector }}</div>
                  </div>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs text-gray-500">{{ el.pageCount }} pages</span>
                    <span
                      v-if="el.contrastRatio"
                      class="text-xs px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20"
                    >
                      {{ el.contrastRatio.toFixed(2) }}:1
                    </span>
                    <span
                      v-if="el.requiredRatio"
                      class="text-xs text-gray-500"
                    >
                      (needs {{ el.requiredRatio }}:1)
                    </span>
                  </div>
                </div>
              </div>
              <SeverityBadge :severity="el.severity" class="shrink-0" />
            </button>
            <div v-if="expandedElements[`contrast-${el.selector}`]" class="px-4 pb-4 pl-11">
              <!-- Color details -->
              <div v-if="el.foregroundColor || el.backgroundColor" class="flex items-center gap-4 mb-3 text-xs">
                <div v-if="el.foregroundColor" class="flex items-center gap-2">
                  <span class="text-gray-500">Foreground:</span>
                  <span
                    class="w-4 h-4 rounded border border-white/10"
                    :style="{ backgroundColor: el.foregroundColor }"
                  />
                  <span class="font-mono text-gray-400">{{ el.foregroundColor }}</span>
                </div>
                <div v-if="el.backgroundColor" class="flex items-center gap-2">
                  <span class="text-gray-500">Background:</span>
                  <span
                    class="w-4 h-4 rounded border border-white/10"
                    :style="{ backgroundColor: el.backgroundColor }"
                  />
                  <span class="font-mono text-gray-400">{{ el.backgroundColor }}</span>
                </div>
              </div>
              <div v-if="el.snippet" class="text-xs text-gray-400 font-mono bg-white/5 p-2 rounded mb-3 overflow-x-auto">
                {{ el.snippet }}
              </div>
              <PagesList :pages="el.pages" />
            </div>
          </div>
        </div>
      </DashboardCard>

      <!-- Other Element Issues -->
      <DashboardCard
        title="Other Element Issues"
        icon="i-heroicons-code-bracket"
        :count="otherElements.length"
      >
        <div v-if="!sortedElements.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No systemic element issues found</p>
        </div>
        <div v-else-if="!otherElements.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>No other element issues (only contrast issues found)</p>
        </div>
        <div v-else class="divide-y divide-white/5 -mx-4">
          <div v-for="el in otherElements" :key="`other-${el.selector}`" class="border-b border-white/5 last:border-0">
            <button
              class="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-white/[0.02] transition-colors"
              @click="toggleElement(`other-${el.selector}`)"
            >
              <div class="flex items-center gap-3 min-w-0 flex-1">
                <UIcon
                  :name="expandedElements[`other-${el.selector}`] ? 'i-heroicons-chevron-down' : 'i-heroicons-chevron-right'"
                  class="w-4 h-4 text-gray-500 shrink-0"
                />
                <div class="min-w-0 flex-1">
                  <div class="text-sm font-mono text-white truncate">{{ el.selector }}</div>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs text-gray-500">{{ el.pageCount }} pages</span>
                    <span class="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
                      {{ auditTitles[el.auditId] || el.auditId }}
                    </span>
                  </div>
                </div>
              </div>
              <SeverityBadge :severity="el.severity" class="shrink-0" />
            </button>
            <div v-if="expandedElements[`other-${el.selector}`]" class="px-4 pb-4 pl-11">
              <p v-if="el.issueDescription" class="text-xs text-gray-400 mb-3">{{ el.issueDescription }}</p>
              <div v-if="el.snippet" class="text-xs text-gray-400 font-mono bg-white/5 p-2 rounded mb-3 overflow-x-auto">
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
      <DashboardCard title="Images Missing Alt Text" icon="i-heroicons-photo" :count="sortedAltImages.length">
        <div v-if="!sortedAltImages.length" class="text-center py-8 text-gray-500">
          <UIcon name="i-heroicons-check-circle" class="w-8 h-8 mx-auto mb-2 text-green-400" />
          <p>All images have alt text</p>
        </div>
        <div v-else class="divide-y divide-white/5">
          <div v-for="img in sortedAltImages" :key="img.url" class="py-3 first:pt-0 last:pb-0">
            <div class="flex items-center gap-4">
              <div class="w-12 h-12 rounded bg-white/5 overflow-hidden shrink-0">
                <img
                  :src="resolveImageUrl(img.url)"
                  :alt="img.url"
                  class="w-full h-full object-cover"
                  loading="lazy"
                  @error="($event.target as HTMLImageElement).style.display = 'none'"
                >
              </div>
              <div class="min-w-0 flex-1">
                <div class="text-sm font-mono text-white truncate">{{ img.url }}</div>
                <div class="flex items-center gap-2 mt-1">
                  <span
                    class="text-xs px-2 py-0.5 rounded"
                    :class="img.isDecorative ? 'bg-gray-500/10 text-gray-400' : 'bg-amber-500/10 text-amber-400'"
                  >
                    {{ img.isDecorative ? 'Likely decorative' : 'Needs alt text' }}
                  </span>
                  <span class="text-xs text-gray-500">{{ img.pageCount }} pages</span>
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
      <DashboardCard title="Routes by Accessibility Score" icon="i-heroicons-queue-list" :count="sortedRoutes.length">
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
