<script setup lang="ts">
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
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
import { toast } from 'vue-sonner'

const route = useRoute()
const api = useApi()
const scanId = route.params.id as string
const { scoreToLabel, scoreToRingColor } = useScoreColor()

const baseScanId = ref<string>('')
const comparing = ref(false)
const statusFilter = ref('all')
const urlFilter = ref('')
const page = ref(1)
const sortKey = ref('delta-perf-desc')
const selectedRowKey = ref<string | null>(null)

const { data: scanMeta } = useAsyncData(
  `compare-meta-${scanId}`,
  () => api['scan.meta']({ scanId }).catch(() => null),
)

const { data: history } = useAsyncData(
  `compare-history`,
  () => api['history.list']({ page: 1, pageSize: 50 }).catch(() => null),
)

const otherScans = computed(() => {
  if (!history.value?.items) return []
  return history.value.items.filter(s => s.scanId !== scanId && s.status === 'complete')
})

const { data: autoBase } = useAsyncData(
  `compare-auto-${scanId}`,
  async () => {
    if (!scanMeta.value) return null
    try {
      const res = await api['compare.findPrevious']({
        site: scanMeta.value.site,
        device: scanMeta.value.device,
        excludeScanId: scanId,
      })
      return res.scanId
    }
    catch { return null }
  },
  { watch: [scanMeta] },
)

watch(autoBase, (id) => {
  if (id && !baseScanId.value) baseScanId.value = id
})

const report = ref<any>(null)
const copyingMarkdown = ref(false)

async function copyAsMarkdown() {
  if (!baseScanId.value) return
  copyingMarkdown.value = true
  try {
    const res = await api['compare.markdown']({
      baseScanId: baseScanId.value as any,
      currentScanId: scanId as any,
    })
    // The clipboard API requires a secure context (https / localhost) and
    // navigator.clipboard. Fall back to a textarea + execCommand for older
    // browsers and the textarea trick on http tailnet URLs — the dashboard
    // is served over a tailscale tunnel which is treated as secure, but
    // belt-and-braces.
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

async function handleCompare() {
  if (!baseScanId.value) return
  comparing.value = true
  selectedRowKey.value = null
  page.value = 1
  try {
    report.value = await (api as any)['compare.detail']({
      baseScanId: baseScanId.value,
      currentScanId: scanId,
      page: page.value,
      pageSize: 100,
      sort: sortKey.value,
      filter: {
        url: urlFilter.value || undefined,
        status: statusFilter.value as any,
      },
    })
  }
  catch (err: any) {
    toast.error('Compare failed', { description: err.message })
  }
  finally {
    comparing.value = false
  }
}

async function fetchPage() {
  if (!baseScanId.value) return
  try {
    report.value = await (api as any)['compare.detail']({
      baseScanId: baseScanId.value,
      currentScanId: scanId,
      page: page.value,
      pageSize: 100,
      sort: sortKey.value,
      filter: {
        url: urlFilter.value || undefined,
        status: statusFilter.value as any,
      },
    })
  }
  catch { }
}

let filterTimeout: ReturnType<typeof setTimeout>
function onFilterInput(e: Event) {
  clearTimeout(filterTimeout)
  urlFilter.value = (e.target as HTMLInputElement).value
  filterTimeout = setTimeout(() => { page.value = 1; fetchPage() }, 300)
}

watch(statusFilter, () => { page.value = 1; fetchPage() })
watch(sortKey, () => { page.value = 1; fetchPage() })
watch(page, () => fetchPage())

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

function fmtScore(v: number | null) {
  if (v == null) return '—'
  return Math.round(v * 100)
}

function fmtMs(v: number | null) {
  if (v == null) return '—'
  if (v >= 1000) return `${(v / 1000).toFixed(1)}s`
  return `${Math.round(v)}ms`
}

function fmtDelta(v: number | null, isScore: boolean) {
  if (v == null) return ''
  if (isScore) {
    const n = (v * 100).toFixed(1)
    return v > 0 ? `+${n}` : n
  }
  if (Math.abs(v) >= 1000) return `${v > 0 ? '+' : ''}${(v / 1000).toFixed(1)}s`
  return `${v > 0 ? '+' : ''}${Math.round(v)}ms`
}

function deltaClass(v: number | null, isScore: boolean) {
  if (v == null || v === 0) return 'text-muted-foreground'
  if (isScore) return v > 0 ? 'text-green-500' : 'text-red-500'
  return v < 0 ? 'text-green-500' : 'text-red-500'
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
</script>

<template>
  <div class="space-y-6">
    <ScanNav />
    <h1 class="text-xl font-bold tracking-tight">Compare</h1>

    <!-- Scan selector -->
    <section class="rounded-lg border p-4">
      <div class="flex flex-col sm:flex-row items-start sm:items-end gap-4">
        <div class="flex-1 space-y-1.5 w-full">
          <label class="text-sm font-medium">Compare against</label>
          <Select v-model="baseScanId">
            <SelectTrigger class="w-full">
              <SelectValue placeholder="Select a previous scan..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem v-for="scan in otherScans" :key="scan.scanId" :value="scan.scanId">
                <div class="flex items-center gap-2">
                  <span class="truncate">{{ scan.site }}</span>
                  <Badge variant="outline" class="text-[10px]">{{ scan.device }}</Badge>
                  <span class="text-xs text-muted-foreground">{{ new Date(scan.startedAt).toLocaleDateString() }}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button :disabled="!baseScanId || comparing" @click="handleCompare">
          <Icon v-if="comparing" name="lucide:loader-2" class="size-4 mr-2 animate-spin" />
          <Icon v-else name="lucide:git-compare-arrows" class="size-4 mr-2" />
          Compare
        </Button>
      </div>
    </section>

    <template v-if="report">
      <!-- Action bar — copy the comparison as a PR-ready Markdown block.
           The handler reuses the same renderer the CI assert pipeline does,
           so what gets pasted into a PR comment matches what the bot would
           leave automatically. -->
      <div class="flex justify-end">
        <Button variant="outline" size="sm" :disabled="copyingMarkdown || !baseScanId" @click="copyAsMarkdown">
          <Icon v-if="copyingMarkdown" name="lucide:loader-2" class="size-4 mr-2 animate-spin" />
          <Icon v-else name="lucide:clipboard-copy" class="size-4 mr-2" />
          Copy as Markdown
        </Button>
      </div>

      <!-- Summary stats -->
      <div class="flex items-center gap-6 flex-wrap border-b pb-5">
        <div class="text-center">
          <div class="text-2xl font-bold tabular-nums">{{ report.summary.totalRoutes }}</div>
          <div class="text-[10px] text-muted-foreground">Total</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold tabular-nums text-red-500">{{ report.summary.regressedRoutes }}</div>
          <div class="text-[10px] text-muted-foreground">Regressed</div>
        </div>
        <div class="text-center">
          <div class="text-2xl font-bold tabular-nums text-green-500">{{ report.summary.improvedRoutes }}</div>
          <div class="text-[10px] text-muted-foreground">Improved</div>
        </div>
        <div v-if="report.summary.addedRoutes" class="text-center">
          <div class="text-2xl font-bold tabular-nums text-blue-500">{{ report.summary.addedRoutes }}</div>
          <div class="text-[10px] text-muted-foreground">Added</div>
        </div>
        <div v-if="report.summary.removedRoutes" class="text-center">
          <div class="text-2xl font-bold tabular-nums text-orange-500">{{ report.summary.removedRoutes }}</div>
          <div class="text-[10px] text-muted-foreground">Removed</div>
        </div>
        <div class="border-l pl-6 ml-2">
          <div class="text-2xl font-bold tabular-nums" :class="(report.summary.avgScoreDelta ?? 0) >= 0 ? 'text-green-500' : 'text-red-500'">
            {{ report.summary.avgScoreDelta != null ? ((report.summary.avgScoreDelta * 100).toFixed(1)) : '—' }}
          </div>
          <div class="text-[10px] text-muted-foreground">Avg Score Δ</div>
        </div>
      </div>

      <!-- Category deltas -->
      <section v-if="report.summary.categoryDeltas?.length">
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Category Scores</h2>
        <div class="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Category</TableHead>
                <TableHead class="w-20 text-right">Base</TableHead>
                <TableHead class="w-20 text-right">Current</TableHead>
                <TableHead class="w-24 text-right">Delta</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow v-for="cd in report.summary.categoryDeltas" :key="cd.category">
                <TableCell class="font-medium text-sm">{{ cd.label }}</TableCell>
                <TableCell class="text-right tabular-nums text-sm" :style="cd.base != null ? { color: scoreToRingColor(cd.base) } : {}">
                  {{ fmtScore(cd.base) }}
                </TableCell>
                <TableCell class="text-right tabular-nums text-sm" :style="cd.current != null ? { color: scoreToRingColor(cd.current) } : {}">
                  {{ fmtScore(cd.current) }}
                </TableCell>
                <TableCell class="text-right tabular-nums text-sm font-medium" :class="deltaClass(cd.delta, true)">
                  {{ fmtDelta(cd.delta, true) }}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>

      <!-- Route-by-route comparison -->
      <section>
        <h2 class="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Route Comparison</h2>

        <!-- Filter bar -->
        <div class="flex items-center gap-3 mb-3">
          <div class="relative flex-1 max-w-sm">
            <Icon name="lucide:search" class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
            <Input placeholder="Filter by URL..." class="pl-8 h-9" :model-value="urlFilter" @input="onFilterInput" />
          </div>
          <Select v-model="statusFilter">
            <SelectTrigger class="w-36 h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="changed">Changed</SelectItem>
              <SelectItem value="regressed">Regressed</SelectItem>
              <SelectItem value="improved">Improved</SelectItem>
              <SelectItem value="added">Added</SelectItem>
              <SelectItem value="removed">Removed</SelectItem>
            </SelectContent>
          </Select>
          <span class="text-xs text-muted-foreground">{{ report.routes.total }} routes</span>
        </div>

        <ResizablePanelGroup direction="horizontal" class="rounded-lg border min-h-[500px]">
          <!-- Left: route table -->
          <ResizablePanel :default-size="60" :min-size="35">
            <div class="h-full overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead class="sticky top-0 bg-background">Path</TableHead>
                    <TableHead class="sticky top-0 bg-background w-20">Status</TableHead>
                    <TableHead class="sticky top-0 bg-background w-16 text-right">Perf</TableHead>
                    <TableHead class="sticky top-0 bg-background w-16 text-right">SEO</TableHead>
                    <TableHead class="sticky top-0 bg-background w-16 text-right">A11y</TableHead>
                    <TableHead class="sticky top-0 bg-background w-16 text-right">BP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow
                    v-for="row in report.routes.items"
                    :key="`${row.url}|${row.device}`"
                    class="cursor-pointer"
                    :class="selectedRowKey === `${row.url}|${row.device}` ? 'bg-muted' : 'hover:bg-muted/50'"
                    @click="selectedRowKey = `${row.url}|${row.device}`"
                  >
                    <TableCell class="font-mono text-xs truncate max-w-[300px]">{{ row.path }}</TableCell>
                    <TableCell>
                      <Badge :variant="statusBadge(row.status)" class="text-[9px] capitalize">{{ row.status }}</Badge>
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-xs" :class="deltaClass(row.deltas?.scorePerformance, true)">
                      {{ fmtDelta(row.deltas?.scorePerformance, true) || fmtScore(row.current?.scorePerformance) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-xs" :class="deltaClass(row.deltas?.scoreSeo, true)">
                      {{ fmtDelta(row.deltas?.scoreSeo, true) || fmtScore(row.current?.scoreSeo) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-xs" :class="deltaClass(row.deltas?.scoreAccessibility, true)">
                      {{ fmtDelta(row.deltas?.scoreAccessibility, true) || fmtScore(row.current?.scoreAccessibility) }}
                    </TableCell>
                    <TableCell class="text-right tabular-nums text-xs" :class="deltaClass(row.deltas?.scoreBestPractices, true)">
                      {{ fmtDelta(row.deltas?.scoreBestPractices, true) || fmtScore(row.current?.scoreBestPractices) }}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>

              <!-- Pagination -->
              <div v-if="totalPages > 1" class="flex items-center justify-between px-4 py-2 border-t">
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

          <!-- Right: selected route detail -->
          <ResizablePanel :default-size="40" :min-size="25">
            <div v-if="selectedRow" class="p-4 h-full overflow-auto space-y-4">
              <div>
                <div class="font-mono text-sm font-medium break-all">{{ selectedRow.url }}</div>
                <div class="flex items-center gap-2 mt-1">
                  <Badge variant="outline" class="text-[10px]">{{ selectedRow.device }}</Badge>
                  <Badge :variant="statusBadge(selectedRow.status)" class="text-[10px] capitalize">{{ selectedRow.status }}</Badge>
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
                        {{ fmtMetric(selectedRow.base?.[m.key], m.score) }}
                      </TableCell>
                      <TableCell class="text-right tabular-nums text-sm">
                        {{ fmtMetric(selectedRow.current?.[m.key], m.score) }}
                      </TableCell>
                      <TableCell class="text-right tabular-nums text-sm font-medium" :class="deltaClass(selectedRow.deltas?.[m.key], m.score)">
                        {{ fmtDelta(selectedRow.deltas?.[m.key], m.score) }}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>

            <div v-else class="h-full flex items-center justify-center text-sm text-muted-foreground">
              Select a route to see details
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </section>
    </template>
  </div>
</template>
