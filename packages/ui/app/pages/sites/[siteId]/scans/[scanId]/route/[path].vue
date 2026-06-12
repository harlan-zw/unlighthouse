<script setup lang="ts">
import { toast } from 'vue-sonner'

definePageMeta({ layout: 'scan' })

const route = useRoute()
const scanId = getScanId()
const routePath = decodeURIComponent(route.params.path as string)
const config = useRuntimeConfig()
const baseUrl = config.public.unlighthouseApiUrl as string
const screenshotUrl = useScreenshotUrl()
const api = useApi()
const router = useRouter()
const { scoreToLabel, scoreToRingColor } = useScoreColor()
const { fmtBytes: formatBytes } = useFormat()

// "Back to Routes": if the user navigated here from the routes list,
// router.back() returns them with filters/page intact. If they
// landed via a deep link the history has no /routes entry to pop, so
// we route forwards to the bare list instead. Detected by walking
// `window.history` length — pre-navigation length === 1 means we're
// the first entry. On SSR we can't tell; default to back() which is
// a no-op when history is empty.
function backToRoutes() {
  if (import.meta.client && window.history.length <= 1) {
    router.push(`/sites/${route.params.siteId}/scans/${scanId}/routes`)
    return
  }
  router.back()
}

const rescanning = ref(false)
const screenshotVisible = ref(true)
// Full-page mobile screenshots are extremely tall (e.g. 412×6000+), so by
// default we show a cropped preview and let the user expand to the full capture.
const screenshotExpanded = ref(false)
// Empty string = let the backend default to whichever device was scanned
// first. The toggle below sets this once we know both devices exist.
const deviceFilter = ref<'' | 'mobile' | 'desktop'>('')

// The route detail page needs the full URL to call `route.get`, but the
// URL param is just a path. Read the scan's site once so we can pair
// them. `fullUrl` stays empty until scan.meta resolves — the gated fetch
// below skips firing rather than guessing "http://localhost<path>" (which
// would 404 every load and only then retry against the real origin once
// scan.meta lands). The fetch watches `fullUrl`, so it runs as soon as the
// real site is known.
const { data: scanMeta, status: scanMetaStatus } = useAsyncData(
  `route-scanmeta-${scanId}`,
  () => api['scan.meta']({ scanId }).catch(() => null),
)
const fullUrl = computed(() => {
  const site = scanMeta.value?.site
  if (!site) return ''
  try { return new URL(routePath, site).toString() }
  catch { return `${site}${routePath}` }
})

async function rescanRoute() {
  rescanning.value = true
  try {
    await api['route.rescan']({ scanId, url: routeData.value?.route?.url || fullUrl.value })
    toast.success('Route rescan started')
  }
  catch (err: any) {
    toast.error('Rescan failed', { description: err.message })
  }
  finally {
    rescanning.value = false
  }
}

const { data: routeData, status } = useAsyncData(
  `route-detail-${scanId}-${routePath}`,
  async () => {
    if (!fullUrl.value) return null
    try {
      return await api['route.get']({
        scanId,
        url: fullUrl.value,
        device: deviceFilter.value || undefined,
      })
    }
    catch {
      return null
    }
  },
  { watch: [deviceFilter, fullUrl] },
)

const availableDevices = computed<string[]>(() => routeData.value?.availableDevices ?? [])
const hasMultipleDevices = computed(() => availableDevices.value.length > 1)

function formatMetric(value: number | null, unit: string = 'ms') {
  if (value === null || value === undefined) return '—'
  if (unit === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
  return value.toFixed(3)
}

const categoryIcons: Record<string, string> = {
  'performance': 'lucide:gauge',
  'accessibility': 'lucide:accessibility',
  'seo': 'lucide:search',
  'best-practices': 'lucide:shield-check',
  'agentic-browsing': 'lucide:bot',
}

const categoryLabels: Record<string, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'seo': 'SEO',
  'best-practices': 'Best Practices',
  'agentic-browsing': 'Agentic Browsing',
}

// All persisted route fields (scorePerformance, lcp, etc.) live on
// `routeData.value.route` now — they're a flat copy of the ScanRoute
// row. The contract-blob-derived fields (categories, audits,
// provenance, etc.) live at the top level alongside.
const scores = computed(() => {
  const r = routeData.value?.route
  if (!r) return []
  const cats = [
    { id: 'performance', label: 'Performance', score: r.scorePerformance },
    { id: 'accessibility', label: 'Accessibility', score: r.scoreAccessibility },
    { id: 'seo', label: 'SEO', score: r.scoreSeo },
    { id: 'best-practices', label: 'Best Practices', score: r.scoreBestPractices },
  ]
  if (r.scoreAgenticBrowsing != null)
    cats.push({ id: 'agentic-browsing', label: 'Agentic Browsing', score: r.scoreAgenticBrowsing })
  return cats.filter(c => c.score != null)
})

const metrics = computed(() => {
  const r = routeData.value?.route
  if (!r) return []
  return [
    { label: 'LCP', value: r.lcp, unit: 'ms', description: 'Largest Contentful Paint' },
    { label: 'CLS', value: r.cls, unit: '', description: 'Cumulative Layout Shift' },
    { label: 'TBT', value: r.tbt, unit: 'ms', description: 'Total Blocking Time' },
    { label: 'FCP', value: r.fcp, unit: 'ms', description: 'First Contentful Paint' },
    { label: 'SI', value: r.si, unit: 'ms', description: 'Speed Index' },
    { label: 'TTFB', value: r.ttfb, unit: 'ms', description: 'Time to First Byte' },
    { label: 'INP', value: r.inp, unit: 'ms', description: 'Interaction to Next Paint' },
  ]
})

interface AuditEntry {
  id: string
  title: string | null
  description: string | null
  severity: 'pass' | 'warn' | 'fail'
  score: number | null
  displayValue: string | null
  metricSavings: Record<string, number> | null
  items: any[] | null
  scoreDisplayMode: string
}

const categoryAudits = computed(() => {
  const cats = routeData.value?.categories as Array<{
    id: string
    title: string
    score: number | null
    auditRefs: Array<{ id: string, weight: number }>
  }> | undefined
  const audits = routeData.value?.audits as Record<string, AuditEntry> | undefined
  if (!cats || !audits) return []

  return cats.map((cat) => {
    const catAudits = cat.auditRefs
      .map(r => audits[r.id])
      .filter((a): a is AuditEntry => !!a)

    const failing = catAudits
      .filter(a => a.severity === 'fail' || a.severity === 'warn')
      .sort((a, b) => {
        if (a.severity === 'fail' && b.severity !== 'fail') return -1
        if (a.severity !== 'fail' && b.severity === 'fail') return 1
        return (a.score ?? 0) - (b.score ?? 0)
      })

    const passing = catAudits
      .filter(a => a.severity === 'pass' && a.scoreDisplayMode !== 'notApplicable' && a.scoreDisplayMode !== 'manual')

    const notApplicable = catAudits
      .filter(a => a.scoreDisplayMode === 'notApplicable' || a.scoreDisplayMode === 'manual')

    return {
      id: cat.id,
      label: categoryLabels[cat.id] || cat.title,
      icon: categoryIcons[cat.id] || 'lucide:folder',
      score: cat.score,
      failing,
      passing,
      notApplicable,
    }
  })
})

function metricColor(label: string, value: number | null | undefined): string {
  if (value == null) return 'text-muted'
  const thresholds: Record<string, [number, number]> = {
    LCP: [2500, 4000], CLS: [0.1, 0.25], TBT: [200, 600],
    FCP: [1800, 3000], SI: [3400, 5800], TTFB: [800, 1800], INP: [200, 500],
  }
  const [good, poor] = thresholds[label] || [Infinity, Infinity]
  if (value <= good) return 'text-success'
  if (value <= poor) return 'text-warning'
  return 'text-error'
}

function severityColor(severity: string): 'error' | 'warning' | 'neutral' {
  if (severity === 'fail') return 'error'
  if (severity === 'warn') return 'warning'
  return 'neutral'
}

function renderMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="underline text-primary hover:text-primary/80">$1</a>')
}

function hasVisibleContent(item: any): boolean {
  return !!(item.url || item.node?.snippet || item.reason || item.wastedBytes || item.wastedMs || item.snippet)
}

function hasNonZeroSavings(savings: Record<string, any>): boolean {
  return Object.values(savings).some(v => typeof v === 'number' ? v > 0 : !!v)
}

</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3">
      <!-- Back to the routes list. Uses router.back() when the user
           navigated here from /routes (preserving their filter state /
           pagination) and falls back to the bare routes URL when the
           page was opened directly (deep link, share). -->
      <UiButton purpose="quiet" size="sm" icon="i-lucide-arrow-left" @click="backToRoutes">Routes</UiButton>
    </div>

    <div v-if="status === 'pending' || scanMetaStatus === 'pending'" class="text-center py-12 text-muted">Loading...</div>
    <div v-else-if="!routeData" class="text-center py-12 text-muted">Route not found.</div>

    <template v-else>
      <!-- Header -->
      <div class="flex items-start justify-between gap-4">
        <div class="min-w-0">
          <h1 class="text-title font-mono break-all">{{ routeData.route?.path }}</h1>
          <div class="flex items-center gap-2 mt-1 text-sm text-muted">
            <UBadge color="neutral" variant="outline" size="xs">{{ routeData.route?.device }}</UBadge>
            <a :href="routeData.route?.url" target="_blank" class="hover:underline flex items-center gap-1">
              {{ routeData.route?.url }}
              <Icon name="lucide:external-link" class="size-3" />
            </a>
          </div>
          <div v-if="routeData.provenance" class="flex items-center gap-3 mt-1 text-xs text-muted/60">
            <span>LH {{ routeData.provenance.lighthouseVersion }}</span>
            <span v-if="routeData.provenance.timingTotal">{{ (routeData.provenance.timingTotal / 1000).toFixed(1) }}s audit</span>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <a
            v-if="routeData.route?.lhrBlobKey"
            :href="`${baseUrl}/dashboard/lhr/${scanId}/${encodeURIComponent(routeData.route?.path || routePath)}${deviceFilter ? `?device=${deviceFilter}` : ''}`"
            :download="`${scanId}-${routeData.route?.device || 'mobile'}.lhr.json`"
            class="inline-flex items-center gap-1 rounded-md px-2.5 h-8 text-sm ring-1 ring-default text-default hover:bg-elevated transition-colors"
          >
            <Icon name="lucide:download" class="size-4" />
            Raw LHR
          </a>
          <UiButton purpose="secondary" size="sm" :loading="rescanning" icon="i-lucide-refresh-cw" @click="rescanRoute">Rescan</UiButton>
        </div>
      </div>

      <!-- Device toggle — only renders when this route was audited on both
           mobile + desktop. Defaults to whichever device the backend picked
           first (empty value); explicit selection re-fetches and swaps the
           displayed scores/audits/screenshot in place. -->
      <div v-if="hasMultipleDevices" class="flex items-center gap-2">
        <span class="text-xs text-muted">View as</span>
        <UTabs
          v-model="deviceFilter"
          :content="false"
          size="sm"
          :items="availableDevices.map(d => ({ value: d, label: d.charAt(0).toUpperCase() + d.slice(1), icon: d === 'mobile' ? 'i-lucide-smartphone' : 'i-lucide-monitor' }))"
        />
      </div>

      <!-- Visual — full-page screenshot captured by the audit worker
           (core.ts:521). Endpoint 404s when no blob exists; we just
           hide the whole card so we don't show a broken image marker. -->
      <UiCard v-if="screenshotVisible" size="sm">
        <template #header>
          <div class="flex flex-row items-center justify-between gap-2">
            <h3 class="text-label text-dimmed">Visual</h3>
            <div class="flex items-center gap-3">
              <button
                type="button"
                class="text-xs text-muted hover:text-default transition-colors inline-flex items-center gap-1"
                @click="screenshotExpanded = !screenshotExpanded"
              >
                <Icon :name="screenshotExpanded ? 'lucide:chevrons-down-up' : 'lucide:chevrons-up-down'" class="size-3" />
                {{ screenshotExpanded ? 'Collapse' : 'Expand' }}
              </button>
              <a
                :href="screenshotUrl(scanId, routeData.route?.path || routePath)"
                target="_blank"
                rel="noopener"
                class="text-xs text-muted hover:text-default transition-colors inline-flex items-center gap-1"
              >Open full size <Icon name="lucide:external-link" class="size-3" /></a>
            </div>
          </div>
        </template>
        <!-- Collapsed: a cropped preview of the top of the page (full-page
             captures are very tall). Expanded: the whole capture in a bounded,
             scrollable viewport so it never dominates the page. Frame width
             tracks the device — a phone column for mobile, full width for
             desktop — so neither form factor looks distorted. -->
        <div
          class="mx-auto w-full overflow-y-auto rounded border bg-elevated"
          :class="[
            screenshotExpanded ? 'max-h-[80vh]' : 'max-h-[420px]',
            routeData.route?.device === 'desktop' ? 'max-w-4xl' : 'max-w-sm',
          ]"
        >
          <img
            :src="screenshotUrl(scanId, routeData.route?.path || routePath, routeData.route?.device || deviceFilter || undefined)"
            loading="lazy"
            alt="Page screenshot"
            class="block w-full h-auto object-top"
            @error="screenshotVisible = false"
          >
        </div>
      </UiCard>

      <!-- Runtime Error -->
      <div v-if="routeData.provenance?.runtimeError" class="border border-error/30 bg-error/5 rounded-lg p-4">
        <div class="flex items-center gap-2 text-sm font-medium text-error">
          <Icon name="lucide:alert-triangle" class="size-4" />
          Runtime Error: {{ routeData.provenance.runtimeError.code }}
        </div>
        <p class="text-xs text-muted mt-1">{{ routeData.provenance.runtimeError.message }}</p>
      </div>

      <!-- Warnings -->
      <div v-if="routeData.provenance?.warnings?.length" class="border border-warning/30 bg-warning/5 rounded-lg p-4">
        <div class="flex items-center gap-2 text-sm font-medium text-warning mb-2">
          <Icon name="lucide:alert-circle" class="size-4" />
          Warnings ({{ routeData.provenance.warnings.length }})
        </div>
        <ul class="text-xs text-muted space-y-1">
          <li v-for="(w, i) in routeData.provenance.warnings" :key="i">{{ w }}</li>
        </ul>
      </div>

      <!-- Category Scores -->
      <div class="grid grid-cols-2" :class="scores.length >= 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'" style="gap: 1rem;">
        <div v-for="s in scores" :key="s.id" class="rounded-xl border border-default bg-[var(--ui-bg-elevated)]/35 p-4 flex items-center gap-4">
          <ScoreRing :score="s.score" size="md" />
          <div>
            <div class="text-sm font-medium">{{ s.label }}</div>
            <div class="numerals-display text-2xl" :style="{ color: scoreToRingColor(s.score) }">
              {{ scoreToLabel(s.score) }}
            </div>
          </div>
        </div>
      </div>

      <!-- Core Web Vitals -->
      <UiCard size="sm">
        <template #header>
          <h3 class="text-label text-dimmed">Core Web Vitals &amp; Metrics</h3>
        </template>
          <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-4">
            <div v-for="m in metrics" :key="m.label" class="rounded-lg border p-4 text-center">
              <div class="text-xs text-muted mb-1">{{ m.label }}</div>
              <div class="numerals-display text-xl" :class="metricColor(m.label, m.value)">
                {{ formatMetric(m.value, m.unit) }}
              </div>
              <div class="text-[10px] text-muted/60 mt-1">{{ m.description }}</div>
            </div>
          </div>
      </UiCard>

      <!-- Category Sections -->
      <template v-for="cat in categoryAudits" :key="cat.id">
        <UiCard size="sm">
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-heading text-default flex items-center gap-2">
                <Icon :name="cat.icon" class="size-4" />
                {{ cat.label }}
              </h3>
              <div class="flex items-center gap-2">
                <UBadge v-if="cat.failing.length" color="error" variant="soft" class="text-xs">
                  {{ cat.failing.length }} failing
                </UBadge>
                <UBadge v-if="cat.passing.length" color="neutral" variant="outline" class="text-xs text-success">
                  {{ cat.passing.length }} passed
                </UBadge>
              </div>
            </div>
          </template>
          <div class="space-y-4">
            <!-- Failing audits -->
            <UAccordion v-if="cat.failing.length" :items="cat.failing.map((a: any) => ({ ...a, value: a.id }))" type="multiple" class="w-full">
              <template #default="{ item: audit }">
                  <div class="flex items-center gap-2 text-left text-sm">
                    <UBadge :color="severityColor(audit.severity)" variant="soft" class="text-[10px] w-10 justify-center shrink-0">
                      {{ audit.severity }}
                    </UBadge>
                    <span>{{ audit.title || audit.id }}</span>
                    <span v-if="audit.displayValue" class="text-muted text-xs ml-auto mr-4 shrink-0">
                      {{ audit.displayValue }}
                    </span>
                  </div>
              </template>
              <template #content="{ item: audit }">
                  <div class="space-y-3 pt-2 pb-2">
                    <p v-if="audit.description" class="text-xs text-muted" v-html="renderMarkdownLinks(audit.description)" />
                    <div v-if="audit.metricSavings && hasNonZeroSavings(audit.metricSavings)" class="flex gap-2 flex-wrap">
                      <template v-for="(val, key) in audit.metricSavings" :key="key">
                        <UBadge v-if="typeof val === 'number' ? val > 0 : !!val" color="neutral" variant="outline" class="text-[10px]">
                          {{ key }}: {{ typeof val === 'number' ? `${Math.round(val)}ms` : val }}
                        </UBadge>
                      </template>
                    </div>
                    <div v-if="audit.items?.filter(hasVisibleContent).length" class="border rounded-lg overflow-hidden">
                      <template v-for="(item, idx) in audit.items.slice(0, 20)" :key="idx">
                        <div v-if="hasVisibleContent(item)" class="border-b last:border-b-0 p-2 text-xs">
                          <div v-if="item.url" class="font-mono break-all text-muted">{{ item.url }}</div>
                          <div v-if="item.node?.snippet" class="font-mono text-[10px] bg-elevated p-1 rounded mt-1">{{ item.node.snippet }}</div>
                          <div v-if="item.snippet" class="font-mono text-[10px] bg-elevated p-1 rounded mt-1">{{ item.snippet }}</div>
                          <div v-if="item.node?.nodeLabel" class="text-muted mt-1">{{ item.node.nodeLabel }}</div>
                          <div v-if="item.reason" class="text-muted mt-1">{{ item.reason }}</div>
                          <div class="flex gap-2 mt-1 flex-wrap">
                            <span v-if="item.wastedBytes" class="text-warning">{{ formatBytes(item.wastedBytes) }} wasted</span>
                            <span v-if="item.wastedMs" class="text-warning">{{ Math.round(item.wastedMs) }}ms wasted</span>
                            <span v-if="item.totalBytes" class="text-muted">{{ formatBytes(item.totalBytes) }} total</span>
                            <span v-if="item.transferSize" class="text-muted">{{ formatBytes(item.transferSize) }} transferred</span>
                            <span v-if="item.blockingTime" class="text-warning">{{ Math.round(item.blockingTime) }}ms blocking</span>
                          </div>
                        </div>
                      </template>
                    </div>
                  </div>
              </template>
            </UAccordion>

            <USeparator v-if="cat.failing.length && (cat.passing.length || cat.notApplicable.length)" />

            <!-- Passed audits (collapsible) -->
            <details v-if="cat.passing.length" class="group">
              <summary class="flex items-center gap-2 w-full text-sm py-1 cursor-pointer list-none">
                <Icon name="lucide:chevron-right" class="size-4 text-muted transition-transform group-open:rotate-90" />
                <Icon name="lucide:check-circle" class="size-4 text-success" />
                <span class="text-success font-medium">Passed Audits</span>
                <UBadge color="neutral" variant="outline" class="text-[10px] text-success">{{ cat.passing.length }}</UBadge>
              </summary>
              <UAccordion :items="cat.passing.map((a: any) => ({ ...a, value: a.id }))" type="multiple" class="w-full mt-2">
                <template #default="{ item: audit }">
                      <div class="flex items-center gap-2 text-left text-sm">
                        <Icon name="lucide:check" class="size-3.5 text-success shrink-0" />
                        <span class="text-muted">{{ audit.title || audit.id }}</span>
                        <span v-if="audit.displayValue" class="text-muted/60 text-xs ml-auto mr-4 shrink-0">
                          {{ audit.displayValue }}
                        </span>
                      </div>
                </template>
                <template #content="{ item: audit }">
                      <div class="space-y-2 pt-1 pl-6 pb-2">
                        <p v-if="audit.description" class="text-xs text-muted" v-html="renderMarkdownLinks(audit.description)" />
                        <div v-if="audit.items?.filter(hasVisibleContent).length" class="border rounded-lg overflow-hidden">
                          <template v-for="(item, idx) in audit.items.slice(0, 10)" :key="idx">
                            <div v-if="hasVisibleContent(item)" class="border-b last:border-b-0 p-2 text-xs">
                              <div v-if="item.url" class="font-mono break-all text-muted">{{ item.url }}</div>
                              <div v-if="item.node?.snippet" class="font-mono text-[10px] bg-elevated p-1 rounded mt-1">{{ item.node.snippet }}</div>
                              <div v-if="item.snippet" class="font-mono text-[10px] bg-elevated p-1 rounded mt-1">{{ item.snippet }}</div>
                              <div class="flex gap-2 mt-1 flex-wrap">
                                <span v-if="item.totalBytes" class="text-muted">{{ formatBytes(item.totalBytes) }}</span>
                                <span v-if="item.transferSize" class="text-muted">{{ formatBytes(item.transferSize) }} transferred</span>
                              </div>
                            </div>
                          </template>
                        </div>
                      </div>
                </template>
              </UAccordion>
            </details>

            <!-- Not Applicable (collapsible) -->
            <details v-if="cat.notApplicable.length" class="group">
              <summary class="flex items-center gap-2 w-full text-sm py-1 cursor-pointer list-none">
                <Icon name="lucide:chevron-right" class="size-4 text-muted transition-transform group-open:rotate-90" />
                <Icon name="lucide:minus-circle" class="size-4 text-muted" />
                <span class="text-muted">Not Applicable</span>
                <UBadge color="neutral" variant="outline" class="text-[10px]">{{ cat.notApplicable.length }}</UBadge>
              </summary>
                <div class="space-y-0.5 pt-2 pl-6">
                  <div v-for="audit in cat.notApplicable" :key="audit.id" class="flex items-center gap-2 py-1 text-sm text-muted/60">
                    <Icon name="lucide:minus" class="size-3 shrink-0" />
                    <span>{{ audit.title || audit.id }}</span>
                  </div>
                </div>
            </details>
          </div>
        </UiCard>
      </template>

      <!-- Stack Packs -->
      <UiCard v-if="routeData.stackPacks?.length" size="sm">
        <template #header>
          <h3 class="text-label text-dimmed">Framework Recommendations</h3>
        </template>
          <div v-for="pack in routeData.stackPacks" :key="pack.id" class="mb-4 last:mb-0">
            <div class="text-sm font-medium mb-1">{{ pack.title }}</div>
            <div v-for="(desc, auditId) in pack.descriptions" :key="auditId" class="text-xs text-muted ml-4 mb-1">
              <span class="font-mono text-primary/80">{{ auditId }}</span>: {{ desc }}
            </div>
          </div>
      </UiCard>

      <!-- Entities -->
      <UiCard v-if="routeData.entities?.length" size="sm">
        <template #header>
          <h3 class="text-label text-dimmed">Third-Party Entities</h3>
        </template>
          <div class="flex flex-wrap gap-2">
            <UBadge v-for="entity in routeData.entities" :key="entity.name" :color="entity.isFirstParty ? 'primary' : 'neutral'" :variant="entity.isFirstParty ? 'solid' : 'outline'" class="text-xs">
              {{ entity.name }}
            </UBadge>
          </div>
      </UiCard>
    </template>
  </div>
</template>
