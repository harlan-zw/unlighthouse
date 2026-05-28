<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  ToggleGroup,
  ToggleGroupItem,
} from '@/components/ui/toggle-group'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { toast } from 'vue-sonner'

definePageMeta({ layout: 'compare' })

const route = useRoute()
const router = useRouter()
const api = useApi()
const { scoreToLabel, scoreToRingColor } = useScoreColor()

// `currentScanId` comes from /compare/:id; `baseScanId` rides the
// query string so a compare can be deep-linked and refresh-survives.
const currentScanId = computed(() => route.params.id as string)
const baseScanId = ref<string>((route.query.base as string) || '')

watch(baseScanId, (v) => {
  // Sync the picked base back into the URL — preserves on refresh,
  // makes the compare shareable as a single link.
  router.replace({ query: { ...route.query, base: v || undefined } })
})

const { data: currentMeta } = useAsyncData(
  `compare-current-meta-${currentScanId.value}`,
  () => api['scan.meta']({ scanId: currentScanId.value as any }).catch(() => null),
  { watch: [currentScanId] },
)

const { data: baseMeta } = useAsyncData(
  `compare-base-meta-${baseScanId.value}`,
  () => baseScanId.value
    ? api['scan.meta']({ scanId: baseScanId.value as any }).catch(() => null)
    : Promise.resolve(null),
  { watch: [baseScanId] },
)

// History is loaded with a generous page size so users with many scans
// can still pick anything from the dropdown without paging. 200 is the
// server cap; for orgs that exceed it we'd need a search box.
const { data: history } = useAsyncData(
  'compare-history',
  () => api['history.list']({ page: 1, pageSize: 200 }).catch(() => null),
)

// CRITICAL FIX: previous version showed scans from any site, leading
// to compares with 0 overlapping routes. Filter to scans of the same
// site as the current scan.
const otherScans = computed(() => {
  if (!history.value?.items || !currentMeta.value) return []
  const site = currentMeta.value.site
  return history.value.items.filter(s =>
    s.scanId !== currentScanId.value
    && s.status === 'complete'
    && s.site === site,
  )
})

// Auto-pick the most recent prior scan on the same site (+ branch if
// the current scan has one). Doesn't override an explicit URL pick.
const { data: autoBase } = useAsyncData(
  `compare-auto-${currentScanId.value}`,
  async () => {
    if (!currentMeta.value || baseScanId.value) return null
    try {
      const res = await api['compare.findPrevious']({
        site: currentMeta.value.site,
        device: currentMeta.value.device,
        // Honour branch when present so deploy-preview comparisons
        // bucket per-branch instead of pulling someone else's commit.
        branch: (currentMeta.value as any).ciBranch ?? undefined,
        excludeScanId: currentScanId.value as any,
      })
      return res.scanId
    }
    catch { return null }
  },
  { watch: [currentMeta] },
)

watch(autoBase, (id) => {
  if (id && !baseScanId.value) baseScanId.value = id as string
})

const comparing = ref(false)
const statusFilter = ref<'all' | 'changed' | 'regressed' | 'improved' | 'added' | 'removed'>('all')
const deviceFilter = ref<'' | 'mobile' | 'desktop'>('')
const urlFilter = ref('')
const page = ref(1)
const sortKey = ref('delta-perf-desc')
const selectedRowKey = ref<string | null>(null)

// Threshold UI bound to the same shape compare.detail accepts. Empty
// string ⇒ omit (handler falls back to CI defaults).
const thresholds = reactive<Record<string, string>>({
  performance: '',
  accessibility: '',
  seo: '',
  'best-practices': '',
  lcp: '',
  cls: '',
})

function thresholdPayload(): Record<string, number> | undefined {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(thresholds)) {
    const n = Number.parseFloat(v)
    if (!Number.isNaN(n) && v.trim() !== '')
      out[k] = n
  }
  return Object.keys(out).length ? out : undefined
}

const report = ref<any>(null)
const copyingMarkdown = ref(false)

async function copyAsMarkdown() {
  if (!baseScanId.value) return
  copyingMarkdown.value = true
  try {
    const res = await api['compare.markdown']({
      baseScanId: baseScanId.value as any,
      currentScanId: currentScanId.value as any,
      thresholds: thresholdPayload() as any,
    })
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(res.markdown)
    }
    else {
      const ta = document.createElement('textarea')
      ta.value = res.markdown
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      document.body.removeChild(ta)
    }
    toast.success(res.hasRegressions ? 'Copied — regressions present' : 'Copied to clipboard')
  }
  catch (err: any) {
    toast.error('Copy failed', { description: err.message })
  }
  finally {
    copyingMarkdown.value = false
  }
}

async function fetchPage() {
  if (!baseScanId.value) return
  try {
    report.value = await (api as any)['compare.detail']({
      baseScanId: baseScanId.value,
      currentScanId: currentScanId.value,
      page: page.value,
      pageSize: 100,
      sort: sortKey.value,
      filter: {
        url: urlFilter.value || undefined,
        status: statusFilter.value as any,
        device: deviceFilter.value || undefined,
      },
      thresholds: thresholdPayload(),
    })
  }
  catch (err: any) {
    toast.error('Compare failed', { description: err.message })
  }
}

async function handleCompare() {
  if (!baseScanId.value) return
  comparing.value = true
  selectedRowKey.value = null
  page.value = 1
  try {
    await fetchPage()
  }
  finally {
    comparing.value = false
  }
}

function swapDirection() {
  if (!baseScanId.value) return
  // A→B becomes B→A. New current = old base; navigate so the URL
  // matches the swap (currentScanId is part of the path).
  const oldBase = baseScanId.value
  router.push(`/compare/${oldBase}?base=${currentScanId.value}`)
}

let filterTimeout: ReturnType<typeof setTimeout>
function onFilterInput(e: Event) {
  clearTimeout(filterTimeout)
  urlFilter.value = (e.target as HTMLInputElement).value
  filterTimeout = setTimeout(() => { page.value = 1; fetchPage() }, 300)
}

watch(statusFilter, () => { page.value = 1; fetchPage() })
watch(deviceFilter, () => { page.value = 1; fetchPage() })
watch(sortKey, () => { page.value = 1; fetchPage() })
watch(page, () => fetchPage())

// Multi-device detection — only show the device chip when both sides
// of the compare actually have routes audited on both devices.
const hasMultipleDevices = computed(() => {
  if (!report.value?.routes?.items) return false
  const devices = new Set(report.value.routes.items.map((r: any) => r.device))
  return devices.size > 1
})

const selectedRow = computed(() => {
  if (!selectedRowKey.value || !report.value) return null
  return report.value.routes.items.find((r: any) => `${r.url}|${r.device}` === selectedRowKey.value) ?? null
})

function statusBadge(status: string) {
  if (status === 'regressed') return 'destructive'
  if (status === 'improved') return 'default'
  if (status === 'added') return 'secondary'
  if (status === 'removed') return 'outline'
  return 'outline'
}

function fmtScore(v: number | null | undefined) {
  if (v == null) return '—'
  return Math.round(v * 100)
}

function fmtMs(v: number | null | undefined) {
  if (v == null) return '—'
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`
  return `${Math.round(v)}ms`
}

function fmtDelta(v: number | null | undefined, isScore: boolean) {
  if (v == null) return '—'
  if (isScore) {
    const n = (v * 100).toFixed(1)
    return v > 0 ? `+${n}` : n
  }
  if (Math.abs(v) >= 1000) return `${v > 0 ? '+' : ''}${(v / 1000).toFixed(1)}s`
  return `${v > 0 ? '+' : ''}${Math.round(v)}ms`
}

function deltaClass(v: number | null | undefined, isScore: boolean) {
  if (v == null || v === 0) return 'text-muted-foreground'
  if (isScore) return v > 0 ? 'text-green-500' : 'text-red-500'
  return v < 0 ? 'text-green-500' : 'text-red-500'
}

// Score cell value: prefer the delta when it exists, otherwise the
// current absolute score. For added/removed rows the cell shows the
// one-side value plainly so the user sees what was new / what was
// lost.
function rowScoreCell(row: any, key: string): { value: string, klass: string } {
  if (row.status === 'added')
    return { value: String(fmtScore(row.current?.[key])), klass: 'text-blue-500' }
  if (row.status === 'removed')
    return { value: String(fmtScore(row.base?.[key])), klass: 'text-orange-500' }
  const delta = row.deltas?.[key]
  if (delta != null && delta !== 0)
    return { value: fmtDelta(delta, true), klass: deltaClass(delta, true) }
  return { value: String(fmtScore(row.current?.[key])), klass: 'text-muted-foreground' }
}

const totalPages = computed(() => {
  if (!report.value) return 1
  return Math.ceil(report.value.routes.total / report.value.routes.pageSize)
})

const DETAIL_METRICS = [
  { key: 'scorePerformance', label: 'Performance', score: true },
  { key: 'scoreAccessibility', label: 'Accessibility', score: true },
  { key: 'scoreSeo', label: 'SEO', score: true },
  { key: 'scoreBestPractices', label: 'Best Practices', score: true },
  { key: 'lcp', label: 'LCP', score: false },
  { key: 'cls', label: 'CLS', score: false },
  { key: 'inp', label: 'INP', score: false },
  { key: 'fcp', label: 'FCP', score: false },
  { key: 'tbt', label: 'TBT', score: false },
  { key: 'ttfb', label: 'TTFB', score: false },
  { key: 'si', label: 'SI', score: false },
]

function fmtMetric(v: number | null, isScore: boolean) {
  if (isScore) return fmtScore(v)
  return fmtMs(v)
}

const sortOptions = [
  { value: 'delta-perf-desc', label: 'Perf Δ (worst first)' },
  { value: 'delta-perf-asc', label: 'Perf Δ (best first)' },
  { value: 'delta-a11y-desc', label: 'A11y Δ (worst first)' },
  { value: 'delta-seo-desc', label: 'SEO Δ (worst first)' },
  { value: 'delta-bp-desc', label: 'BP Δ (worst first)' },
  { value: 'delta-lcp-desc', label: 'LCP Δ (slowest)' },
  { value: 'delta-cls-desc', label: 'CLS Δ (worst)' },
  { value: 'url-asc', label: 'URL (A-Z)' },
]

// Verdict: human-friendly one-liner for the top of the page. Mirrors
// the markdown handler's verdict so the dashboard and the PR comment
// agree on the story.
const verdict = computed(() => {
  if (!report.value) return null
  const s = report.value.summary
  if (s.regressedRoutes > 0)
    return { tone: 'destructive', text: `${s.regressedRoutes} route${s.regressedRoutes === 1 ? '' : 's'} regressed` }
  if (s.improvedRoutes > 0)
    return { tone: 'default', text: `${s.improvedRoutes} route${s.improvedRoutes === 1 ? '' : 's'} improved` }
  if (s.addedRoutes > 0 || s.removedRoutes > 0)
    return { tone: 'secondary', text: 'Route set changed' }
  return { tone: 'outline', text: 'No significant change' }
})

function shortId(id: string | null | undefined): string {
  if (!id) return ''
  return id.slice(0, 8)
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString()
}

// Auto-trigger the initial compare when the page loads with a base in
// the URL OR when autoBase resolves. The user can still click Compare
// to refresh after changing thresholds / filters.
watch([baseScanId, currentScanId], ([b, c]) => {
  if (b && c) {
    page.value = 1
    fetchPage()
  }
}, { immediate: true })

function gotoOverview(id: string) {
  router.push(`/scan/${id}/overview`)
}
</script>

<template>
  <div class="h-full flex flex-col">
    <!-- Top toolbar — base/current scan identity, swap, picker, actions -->
    <div class="border-b bg-card/50">
      <div class="px-4 py-2.5 flex items-center gap-3 flex-wrap">
        <Icon name="lucide:git-compare-arrows" class="size-4 text-muted-foreground shrink-0" />

        <!-- Base scan -->
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Base</span>
          <Select v-model="baseScanId">
            <SelectTrigger class="h-8 min-w-[220px] max-w-[320px] text-xs">
              <SelectValue placeholder="Pick a previous scan..." />
            </SelectTrigger>
            <SelectContent>
              <div v-if="!otherScans.length" class="px-2 py-3 text-center text-xs text-muted-foreground">
                No other scans of this site yet.
              </div>
              <SelectItem v-for="scan in otherScans" :key="scan.scanId" :value="scan.scanId">
                <div class="flex items-center gap-2 text-xs">
                  <span class="font-mono">{{ shortId(scan.scanId) }}</span>
                  <Badge variant="outline" class="text-[9px]">{{ scan.device }}</Badge>
                  <span class="text-muted-foreground">{{ fmtDate(scan.completedAt || scan.startedAt) }}</span>
                  <span v-if="(scan as any).ciCommit" class="font-mono text-[10px] text-muted-foreground">{{ ((scan as any).ciCommit as string).slice(0, 7) }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        <!-- Swap -->
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger as-child>
              <Button variant="ghost" size="sm" class="size-8 p-0" :disabled="!baseScanId" @click="swapDirection">
                <Icon name="lucide:arrow-left-right" class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Swap base ↔ current</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <!-- Current scan -->
        <div class="flex items-center gap-2 min-w-0">
          <span class="text-[10px] uppercase tracking-wider text-muted-foreground shrink-0">Current</span>
          <span class="font-mono text-xs">{{ shortId(currentScanId) }}</span>
          <Badge v-if="currentMeta" variant="outline" class="text-[9px]">{{ currentMeta.device }}</Badge>
          <span v-if="currentMeta" class="text-xs text-muted-foreground truncate max-w-[200px]">{{ currentMeta.site }}</span>
        </div>

        <div class="ml-auto flex items-center gap-1.5">
          <!-- Thresholds popover -->
          <Popover>
            <PopoverTrigger as-child>
              <Button variant="outline" size="sm" class="h-8">
                <Icon name="lucide:sliders-horizontal" class="size-3.5 mr-1.5" />
                Thresholds
              </Button>
            </PopoverTrigger>
            <PopoverContent class="w-80">
              <div class="space-y-3">
                <div>
                  <h4 class="text-sm font-semibold">Regression thresholds</h4>
                  <p class="text-xs text-muted-foreground">Empty = CI defaults. Scores are 0–1; CWV are in ms (CLS unitless).</p>
                </div>
                <div class="grid grid-cols-2 gap-2 text-xs">
                  <label class="space-y-1">
                    <span class="text-muted-foreground">Performance</span>
                    <Input v-model="thresholds.performance" placeholder="0.05" class="h-7 text-xs" />
                  </label>
                  <label class="space-y-1">
                    <span class="text-muted-foreground">Accessibility</span>
                    <Input v-model="thresholds.accessibility" placeholder="0.05" class="h-7 text-xs" />
                  </label>
                  <label class="space-y-1">
                    <span class="text-muted-foreground">SEO</span>
                    <Input v-model="thresholds.seo" placeholder="0.05" class="h-7 text-xs" />
                  </label>
                  <label class="space-y-1">
                    <span class="text-muted-foreground">Best Practices</span>
                    <Input v-model="thresholds['best-practices']" placeholder="0.05" class="h-7 text-xs" />
                  </label>
                  <label class="space-y-1">
                    <span class="text-muted-foreground">LCP (ms)</span>
                    <Input v-model="thresholds.lcp" placeholder="500" class="h-7 text-xs" />
                  </label>
                  <label class="space-y-1">
                    <span class="text-muted-foreground">CLS</span>
                    <Input v-model="thresholds.cls" placeholder="0.1" class="h-7 text-xs" />
                  </label>
                </div>
                <Button size="sm" class="w-full" @click="handleCompare">
                  Apply
                </Button>
              </div>
            </PopoverContent>
          </Popover>

          <Button variant="outline" size="sm" class="h-8" :disabled="copyingMarkdown || !baseScanId || !report" @click="copyAsMarkdown">
            <Icon v-if="copyingMarkdown" name="lucide:loader-2" class="size-3.5 mr-1.5 animate-spin" />
            <Icon v-else name="lucide:clipboard-copy" class="size-3.5 mr-1.5" />
            Copy MD
          </Button>

          <Button size="sm" class="h-8" :disabled="!baseScanId || comparing" @click="handleCompare">
            <Icon v-if="comparing" name="lucide:loader-2" class="size-3.5 mr-1.5 animate-spin" />
            <Icon v-else name="lucide:refresh-cw" class="size-3.5 mr-1.5" />
            Compare
          </Button>
        </div>
      </div>

      <!-- Scan-metadata strip — visible only when both scans are loaded -->
      <div v-if="baseMeta && currentMeta" class="px-4 py-2 text-xs flex items-center gap-4 flex-wrap border-t bg-background/40">
        <button class="hover:underline text-muted-foreground hover:text-foreground inline-flex items-center gap-1" @click="gotoOverview(baseScanId)">
          <Icon name="lucide:external-link" class="size-3" />
          Base: {{ fmtDate((baseMeta as any).completedAt || baseMeta.startedAt) }}
          <span v-if="(baseMeta as any).ciCommit" class="font-mono text-[10px]">· {{ ((baseMeta as any).ciCommit as string).slice(0, 7) }}</span>
          <span v-if="(baseMeta as any).ciBranch" class="text-[10px]">· {{ (baseMeta as any).ciBranch }}</span>
        </button>
        <Icon name="lucide:arrow-right" class="size-3 text-muted-foreground" />
        <button class="hover:underline text-muted-foreground hover:text-foreground inline-flex items-center gap-1" @click="gotoOverview(currentScanId)">
          <Icon name="lucide:external-link" class="size-3" />
          Current: {{ fmtDate((currentMeta as any).completedAt || currentMeta.startedAt) }}
          <span v-if="(currentMeta as any).ciCommit" class="font-mono text-[10px]">· {{ ((currentMeta as any).ciCommit as string).slice(0, 7) }}</span>
          <span v-if="(currentMeta as any).ciBranch" class="text-[10px]">· {{ (currentMeta as any).ciBranch }}</span>
        </button>
      </div>
    </div>

    <!-- Empty state — no base picked yet -->
    <div v-if="!baseScanId" class="flex-1 flex items-center justify-center p-8">
      <Card class="max-w-md">
        <CardContent class="pt-6 text-center space-y-3">
          <Icon name="lucide:git-compare-arrows" class="size-12 text-muted-foreground/40 mx-auto" />
          <h3 class="font-semibold">Pick a scan to compare against</h3>
          <p class="text-sm text-muted-foreground">
            Use the <strong>Base</strong> dropdown above to pick a prior scan of <span class="font-mono text-xs">{{ currentMeta?.site || 'this site' }}</span>. The most recent scan on the same device + branch is auto-selected when available.
          </p>
          <p v-if="!otherScans.length" class="text-xs text-muted-foreground/70">
            No other scans of this site exist yet — run another scan first.
          </p>
        </CardContent>
      </Card>
    </div>

    <!-- No report yet but base picked: instructive empty state -->
    <div v-else-if="!report && !comparing" class="flex-1 flex items-center justify-center p-8">
      <Card class="max-w-md">
        <CardContent class="pt-6 text-center space-y-3">
          <Icon name="lucide:play" class="size-10 text-muted-foreground/40 mx-auto" />
          <p class="text-sm text-muted-foreground">Press <strong>Compare</strong> to run the diff.</p>
        </CardContent>
      </Card>
    </div>

    <!-- Loading -->
    <div v-else-if="comparing && !report" class="flex-1 flex items-center justify-center">
      <Icon name="lucide:loader-2" class="size-6 animate-spin text-muted-foreground" />
    </div>

    <!-- Report body -->
    <template v-else-if="report">
      <!-- Summary band -->
      <div class="px-4 py-3 border-b flex items-center gap-6 flex-wrap">
        <Badge v-if="verdict" :variant="verdict.tone as any" class="text-sm px-3 py-1">
          {{ verdict.text }}
        </Badge>
        <div class="flex items-center gap-5 text-xs">
          <div class="flex items-center gap-1.5">
            <span class="text-muted-foreground">Total</span>
            <span class="font-bold tabular-nums">{{ report.summary.totalRoutes }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-muted-foreground">Regressed</span>
            <span class="font-bold tabular-nums text-red-500">{{ report.summary.regressedRoutes }}</span>
          </div>
          <div class="flex items-center gap-1.5">
            <span class="text-muted-foreground">Improved</span>
            <span class="font-bold tabular-nums text-green-500">{{ report.summary.improvedRoutes }}</span>
          </div>
          <div v-if="report.summary.addedRoutes" class="flex items-center gap-1.5">
            <span class="text-muted-foreground">Added</span>
            <span class="font-bold tabular-nums text-blue-500">{{ report.summary.addedRoutes }}</span>
          </div>
          <div v-if="report.summary.removedRoutes" class="flex items-center gap-1.5">
            <span class="text-muted-foreground">Removed</span>
            <span class="font-bold tabular-nums text-orange-500">{{ report.summary.removedRoutes }}</span>
          </div>
          <div class="flex items-center gap-1.5 border-l pl-5">
            <span class="text-muted-foreground">Avg Score Δ</span>
            <span class="font-bold tabular-nums" :class="(report.summary.avgScoreDelta ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'">
              {{ report.summary.avgScoreDelta != null ? (report.summary.avgScoreDelta * 100).toFixed(1) : '—' }}
            </span>
          </div>
        </div>

        <!-- Category strip — inline, compact -->
        <div v-if="report.summary.categoryDeltas?.length" class="ml-auto flex items-center gap-3 text-xs">
          <div v-for="cd in report.summary.categoryDeltas" :key="cd.category" class="flex items-center gap-1">
            <span class="text-muted-foreground">{{ cd.label }}</span>
            <span class="tabular-nums" :style="cd.base != null ? { color: scoreToRingColor(cd.base) } : {}">{{ fmtScore(cd.base) }}</span>
            <Icon name="lucide:arrow-right" class="size-2.5 text-muted-foreground/40" />
            <span class="tabular-nums" :style="cd.current != null ? { color: scoreToRingColor(cd.current) } : {}">{{ fmtScore(cd.current) }}</span>
            <span class="font-bold tabular-nums" :class="deltaClass(cd.delta, true)">{{ fmtDelta(cd.delta, true) }}</span>
          </div>
        </div>
      </div>

      <!-- Filter bar -->
      <div class="px-4 py-2 border-b flex items-center gap-3 flex-wrap">
        <div class="relative w-64">
          <Icon name="lucide:search" class="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground pointer-events-none" />
          <Input placeholder="Filter by URL or path..." class="pl-8 h-8 text-xs" :model-value="urlFilter" @input="onFilterInput" />
        </div>

        <ToggleGroup v-model="statusFilter" type="single" size="sm" variant="outline">
          <ToggleGroupItem value="all" class="text-xs h-7">All</ToggleGroupItem>
          <ToggleGroupItem value="changed" class="text-xs h-7">Changed</ToggleGroupItem>
          <ToggleGroupItem value="regressed" class="text-xs h-7 data-[state=on]:text-red-500">Regressed</ToggleGroupItem>
          <ToggleGroupItem value="improved" class="text-xs h-7 data-[state=on]:text-green-500">Improved</ToggleGroupItem>
          <ToggleGroupItem value="added" class="text-xs h-7 data-[state=on]:text-blue-500">Added</ToggleGroupItem>
          <ToggleGroupItem value="removed" class="text-xs h-7 data-[state=on]:text-orange-500">Removed</ToggleGroupItem>
        </ToggleGroup>

        <ToggleGroup v-if="hasMultipleDevices" v-model="deviceFilter" type="single" size="sm" variant="outline">
          <ToggleGroupItem value="" class="text-xs h-7">All</ToggleGroupItem>
          <ToggleGroupItem value="mobile" class="text-xs h-7">
            <Icon name="lucide:smartphone" class="size-3 mr-1" />Mobile
          </ToggleGroupItem>
          <ToggleGroupItem value="desktop" class="text-xs h-7">
            <Icon name="lucide:monitor" class="size-3 mr-1" />Desktop
          </ToggleGroupItem>
        </ToggleGroup>

        <Select v-model="sortKey">
          <SelectTrigger class="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="opt in sortOptions" :key="opt.value" :value="opt.value" class="text-xs">
              {{ opt.label }}
            </SelectItem>
          </SelectContent>
        </Select>

        <span class="ml-auto text-xs text-muted-foreground tabular-nums">
          {{ report.routes.total }} route{{ report.routes.total === 1 ? '' : 's' }}
        </span>
      </div>

      <!-- Main split: table left, detail right -->
      <ResizablePanelGroup direction="horizontal" class="flex-1 min-h-0">
        <ResizablePanel :default-size="62" :min-size="35">
          <div class="h-full overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead class="sticky top-0 z-10 bg-background min-w-[200px]">Path</TableHead>
                  <TableHead class="sticky top-0 z-10 bg-background w-20">Status</TableHead>
                  <TableHead v-if="hasMultipleDevices" class="sticky top-0 z-10 bg-background w-16 text-center">Dev</TableHead>
                  <TableHead class="sticky top-0 z-10 bg-background w-16 text-right">Perf</TableHead>
                  <TableHead class="sticky top-0 z-10 bg-background w-16 text-right">A11y</TableHead>
                  <TableHead class="sticky top-0 z-10 bg-background w-16 text-right">SEO</TableHead>
                  <TableHead class="sticky top-0 z-10 bg-background w-16 text-right">BP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <template v-if="report.routes.items.length">
                  <TableRow
                    v-for="row in report.routes.items"
                    :key="`${row.url}|${row.device}`"
                    class="cursor-pointer"
                    :class="selectedRowKey === `${row.url}|${row.device}` ? 'bg-muted' : 'hover:bg-muted/50'"
                    @click="selectedRowKey = `${row.url}|${row.device}`"
                  >
                    <TableCell class="font-mono text-xs">
                      <span :title="row.url" class="block truncate max-w-[400px]">{{ row.path }}</span>
                    </TableCell>
                    <TableCell>
                      <Badge :variant="statusBadge(row.status)" class="text-[9px] capitalize">{{ row.status }}</Badge>
                    </TableCell>
                    <TableCell v-if="hasMultipleDevices" class="text-center">
                      <Icon :name="row.device === 'mobile' ? 'lucide:smartphone' : 'lucide:monitor'" class="size-3.5 text-muted-foreground inline" />
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-xs" :class="rowScoreCell(row, 'scorePerformance').klass">
                      {{ rowScoreCell(row, 'scorePerformance').value }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-xs" :class="rowScoreCell(row, 'scoreAccessibility').klass">
                      {{ rowScoreCell(row, 'scoreAccessibility').value }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-xs" :class="rowScoreCell(row, 'scoreSeo').klass">
                      {{ rowScoreCell(row, 'scoreSeo').value }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-xs" :class="rowScoreCell(row, 'scoreBestPractices').klass">
                      {{ rowScoreCell(row, 'scoreBestPractices').value }}
                    </TableCell>
                  </TableRow>
                </template>
                <template v-else>
                  <TableRow>
                    <TableCell :colspan="hasMultipleDevices ? 7 : 6" class="text-center py-10 text-muted-foreground text-sm">
                      No routes match the current filter.
                    </TableCell>
                  </TableRow>
                </template>
              </TableBody>
            </Table>

            <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-2 border-t sticky bottom-0 bg-background">
              <span class="text-xs text-muted-foreground">Page {{ page }} of {{ totalPages }}</span>
              <div class="flex gap-1">
                <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">
                  <Icon name="lucide:chevron-left" class="size-3.5" />
                </Button>
                <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page++">
                  <Icon name="lucide:chevron-right" class="size-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </ResizablePanel>

        <ResizableHandle with-handle />

        <ResizablePanel :default-size="38" :min-size="25">
          <div v-if="selectedRow" class="h-full overflow-auto p-4 space-y-4">
            <div>
              <div class="font-mono text-sm font-medium break-all">{{ selectedRow.url }}</div>
              <div class="flex items-center gap-2 mt-1">
                <Badge variant="outline" class="text-[10px]">{{ selectedRow.device }}</Badge>
                <Badge :variant="statusBadge(selectedRow.status)" class="text-[10px] capitalize">{{ selectedRow.status }}</Badge>
                <NuxtLink
                  :to="`/scan/${currentScanId}/route/${encodeURIComponent(selectedRow.path)}`"
                  class="text-[10px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                >
                  <Icon name="lucide:external-link" class="size-2.5" />
                  Open route detail
                </NuxtLink>
              </div>
            </div>

            <div class="rounded-lg border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Metric</TableHead>
                    <TableHead class="w-20 text-right">Base</TableHead>
                    <TableHead class="w-20 text-right">Current</TableHead>
                    <TableHead class="w-20 text-right">Delta</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow v-for="m in DETAIL_METRICS" :key="m.key">
                    <TableCell class="text-sm font-medium">{{ m.label }}</TableCell>
                    <TableCell class="text-right tabular-nums text-sm">
                      {{ fmtMetric(selectedRow.base?.[m.key] ?? null, m.score) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-sm">
                      {{ fmtMetric(selectedRow.current?.[m.key] ?? null, m.score) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-sm font-medium" :class="deltaClass(selectedRow.deltas?.[m.key], m.score)">
                      {{ fmtDelta(selectedRow.deltas?.[m.key], m.score) }}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>

          <div v-else class="h-full flex items-center justify-center text-sm text-muted-foreground p-4 text-center">
            <div class="space-y-2">
              <Icon name="lucide:mouse-pointer-click" class="size-8 mx-auto text-muted-foreground/40" />
              <p>Select a route to see the full metric breakdown.</p>
            </div>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </template>
  </div>
</template>
