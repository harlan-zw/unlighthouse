<script setup lang="ts">
// The advanced scan-routes table. Loads every route for the scan once (≤500)
// and does filtering + sorting client-side, so every column header sorts
// instantly (the server only sorts overall score + CWV) and quick filters
// apply across all routes, not just a page. Web-vitals cells are coloured by
// Google's good/needs-work/poor thresholds; screenshot thumbs, device split,
// column visibility, density and a sticky header round it out.
import type { ColumnDef, SortingState } from '@tanstack/vue-table'
import { toast } from 'vue-sonner'
import { useScanStore } from '~/stores/scan'

const router = useRouter()
const route = useRoute()
const api = useApi()
const store = useScanStore()
const { scanId, scanBase } = useScanBase()
const { scoreToColor, scoreToLabel } = useScoreColor()
const screenshotUrl = useScreenshotUrl()

// Load the whole scan once; everything below is client-side. 500 is the
// scan.results cap — past that we note the truncation.
const { data: scanResults, refresh } = useAsyncData(
  `scan-routes-table-${scanId.value}`,
  () => api['scan.results']({ scanId: scanId.value, page: 1, pageSize: 500 }).catch(() => null),
  { watch: [scanId] },
)
useScanWebsocket({ 'scan:complete': refresh })

// Overall route score (0..100) = mean of its non-null category scores.
function overallScore(r: { scorePerformance: number | null, scoreAccessibility: number | null, scoreSeo: number | null, scoreBestPractices: number | null }): number | null {
  const xs = [r.scorePerformance, r.scoreAccessibility, r.scoreSeo, r.scoreBestPractices].filter((s): s is number => s != null)
  if (!xs.length)
    return null
  return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100)
}

// Trend: pull the previous scan of this site/device and map path → overall
// score, so the table can show each route's delta vs last time.
const { data: prevData } = useAsyncData(
  `routes-prev-${scanId.value}`,
  async () => {
    const meta = await api['scan.meta']({ scanId: scanId.value }).catch(() => null)
    if (!meta)
      return null
    const prev = await api['compare.findPrevious']({ site: meta.site, device: meta.device as any, excludeScanId: scanId.value }).catch(() => null)
    if (!prev?.scanId)
      return null
    const res = await api['scan.results']({ scanId: prev.scanId, page: 1, pageSize: 500 }).catch(() => null)
    if (!res)
      return null
    const map = new Map<string, number>()
    for (const r of res.items as any[]) {
      const o = overallScore(r)
      if (o != null)
        map.set(r.path || r.url, o)
    }
    return map
  },
  { watch: [scanId] },
)
const prevMap = computed(() => prevData.value ?? null)
const hasPrev = computed(() => (prevMap.value?.size ?? 0) > 0)

interface RouteRow {
  url: string
  path: string
  device: string
  scorePerformance: number | null
  scoreAccessibility: number | null
  scoreSeo: number | null
  scoreBestPractices: number | null
  lcp: number | null
  cls: number | null
  tbt: number | null
  fcp: number | null
  si: number | null
  ttfb: number | null
}

const allRows = computed(() => (scanResults.value?.items ?? []) as RouteRow[])
const total = computed(() => scanResults.value?.total ?? 0)
const truncated = computed(() => total.value > allRows.value.length)

const hasMultipleDevices = computed(() => new Set(allRows.value.map(r => r.device)).size > 1)

// ── Filters (client-side) — initial state hydrated from the URL query so the
// view is shareable / back-button friendly ───────────────────────────────────
const q = ref((route.query.q as string) || '')
const deviceFilter = ref<'all' | 'mobile' | 'desktop'>((route.query.device as any) || 'all')
const quick = ref<'all' | 'failing' | 'poor-cwv'>((route.query.f as any) || 'all')

const CWV_THRESHOLDS: Record<string, [number, number]> = {
  lcp: [2500, 4000],
  cls: [0.1, 0.25],
  tbt: [200, 600],
}
function cwvColor(metric: 'lcp' | 'cls' | 'tbt', v: number | null): string {
  if (v == null) return 'text-muted'
  const [good, poor] = CWV_THRESHOLDS[metric]!
  return v <= good ? 'text-success' : v <= poor ? 'text-warning' : 'text-error'
}

function passesQuick(r: RouteRow): boolean {
  if (quick.value === 'failing')
    return [r.scorePerformance, r.scoreAccessibility, r.scoreSeo, r.scoreBestPractices].some(s => s != null && s < 0.9)
  if (quick.value === 'poor-cwv')
    return (r.lcp != null && r.lcp > 4000) || (r.cls != null && r.cls > 0.25) || (r.tbt != null && r.tbt > 600)
  return true
}

const filtered = computed(() => {
  const needle = q.value.trim().toLowerCase()
  return allRows.value.filter((r) => {
    if (deviceFilter.value !== 'all' && r.device !== deviceFilter.value) return false
    if (needle && !(r.path || r.url).toLowerCase().includes(needle)) return false
    if (!passesQuick(r)) return false
    return true
  })
})

const QUICK_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'failing', label: 'Failing' },
  { key: 'poor-cwv', label: 'Poor CWV' },
] as const

// ── Scan context strip (computed from the loaded routes, no extra fetch) ─────
const showAllMetrics = ref(false)
const summary = computed(() => {
  const rows = filtered.value
  const overalls = rows.map(overallScore).filter((v): v is number => v != null)
  const avg = overalls.length ? Math.round(overalls.reduce((a, b) => a + b, 0) / overalls.length) : null
  let pass = 0
  let needs = 0
  let poor = 0
  for (const o of overalls) {
    if (o >= 90) pass++
    else if (o >= 50) needs++
    else poor++
  }
  return { count: rows.length, avg, pass, needs, poor, devices: [...new Set(rows.map(r => r.device))] }
})
function score100Color(v: number | null): string {
  if (v == null) return 'var(--muted-foreground)'
  return v >= 90 ? '#22c55e' : v >= 50 ? '#f97316' : '#ef4444'
}

// ── Sorting (client-side, header-driven) ─────────────────────────────────────
function parseSort(s?: string): SortingState {
  if (!s)
    return [{ id: 'scorePerformance', desc: false }]
  const [id, dir] = s.split(':')
  return id ? [{ id, desc: dir === 'desc' }] : [{ id: 'scorePerformance', desc: false }]
}
const sorting = ref<SortingState>(parseSort(route.query.sort as string))

// Reflect filter/sort into the URL (replace, so we don't spam history).
watch([q, deviceFilter, quick, sorting], () => {
  const s = sorting.value[0]
  const query: Record<string, string> = {}
  if (q.value.trim()) query.q = q.value.trim()
  if (deviceFilter.value !== 'all') query.device = deviceFilter.value
  if (quick.value !== 'all') query.f = quick.value
  if (s) query.sort = `${s.id}:${s.desc ? 'desc' : 'asc'}`
  router.replace({ query })
}, { deep: true })

// ── Row actions ──────────────────────────────────────────────────────────────
async function copyRouteUrl(r: RouteRow) {
  try {
    await navigator.clipboard.writeText(r.url)
    toast.success('URL copied')
  }
  catch {
    toast.error('Could not copy URL')
  }
}
async function rescanRoute(r: RouteRow) {
  try {
    await api['route.rescan']({ scanId: scanId.value, url: r.url })
    toast.success('Route rescan started', { description: r.path || r.url })
  }
  catch (err: any) {
    toast.error('Rescan failed', { description: err?.message })
  }
}

const density = ref<'comfortable' | 'compact'>('comfortable')
const tableRef = ref<{ table: any } | null>(null)

// Column-toggle dropdown items for UDropdownMenu's data-driven :items API —
// a label-header group + a checkbox per leaf column.
const columnToggleItems = computed(() => [
  [{ label: 'Toggle columns', type: 'label' as const }],
  (tableRef.value?.table?.getAllLeafColumns() ?? []).map((col: any) => ({
    label: colLabels[col.id] ?? col.id,
    type: 'checkbox' as const,
    checked: col.getIsVisible(),
    onUpdateChecked: () => col.toggleVisibility(),
    onSelect: (e: Event) => e.preventDefault(),
  })),
])
const colLabels: Record<string, string> = {
  thumbnail: 'Thumbnail',
  path: 'Path',
  device: 'Device',
  scorePerformance: 'Performance',
  scoreAccessibility: 'Accessibility',
  scoreSeo: 'SEO',
  scoreBestPractices: 'Best Practices',
  delta: 'Δ vs prev',
  lcp: 'LCP',
  cls: 'CLS',
  tbt: 'TBT',
}

function formatMetric(value: number | null, unit: string = 'ms') {
  if (value === null) return '—'
  if (unit === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
  return value.toFixed(3)
}

function openRoute(r: RouteRow) {
  router.push(`${scanBase.value}/route/${encodeURIComponent(r.path || r.url)}`)
}

const SCORE_COLS: { key: keyof RouteRow, label: string }[] = [
  { key: 'scorePerformance', label: 'Perf' },
  { key: 'scoreAccessibility', label: 'A11y' },
  { key: 'scoreSeo', label: 'SEO' },
  { key: 'scoreBestPractices', label: 'BP' },
]

const columns = computed<ColumnDef<RouteRow>[]>(() => {
  const cols: ColumnDef<RouteRow>[] = [
    {
      id: 'thumbnail',
      header: '',
      enableSorting: false,
      meta: { headClass: 'w-[70px]' },
      cell: ({ row }) => {
        const path = row.original.path || row.original.url
        const src = screenshotUrl(scanId.value, path)
        return h('img', {
          src,
          loading: 'lazy',
          alt: '',
          class: 'w-14 h-9 object-cover object-top rounded border bg-elevated shrink-0',
          onError: (e: Event) => { (e.target as HTMLImageElement).style.visibility = 'hidden' },
        })
      },
    },
    {
      accessorKey: 'path',
      header: 'Path',
      meta: { headClass: 'min-w-[200px]' },
      cell: ({ row }) => h('span', { class: 'font-mono text-xs truncate block max-w-xs' }, row.original.path || row.original.url),
    },
  ]

  if (hasMultipleDevices.value && deviceFilter.value === 'all') {
    cols.push({
      accessorKey: 'device',
      header: 'Device',
      enableSorting: false,
      meta: { align: 'center', headClass: 'w-16' },
      cell: ({ row }) => h(resolveComponent('Icon'), {
        name: row.original.device === 'mobile' ? 'lucide:smartphone' : 'lucide:monitor',
        class: 'size-3.5 text-muted',
      }),
    })
  }

  for (const s of SCORE_COLS) {
    cols.push({
      id: s.key,
      accessorFn: (row: RouteRow) => (row[s.key] as number | null) ?? undefined,
      header: s.label,
      sortUndefined: 'last',
      meta: { align: 'center', headClass: 'w-16' },
      cell: ({ row }) => {
        const score = row.original[s.key] as number | null
        return h('span', { class: `text-xs font-bold tabular-nums ${scoreToColor(score)}` }, scoreToLabel(score))
      },
    })
  }

  if (hasPrev.value) {
    cols.push({
      id: 'delta',
      accessorFn: (row: RouteRow) => {
        const prev = prevMap.value?.get(row.path || row.url)
        const cur = overallScore(row)
        return prev == null || cur == null ? undefined : cur - prev
      },
      header: 'Δ',
      sortUndefined: 'last',
      meta: { align: 'right', headClass: 'w-16' },
      cell: ({ row }) => {
        const prev = prevMap.value?.get(row.original.path || row.original.url)
        const cur = overallScore(row.original)
        if (prev == null)
          return h('span', { class: 'text-[10px] text-muted border rounded px-1 py-0.5' }, 'new')
        if (cur == null)
          return h('span', { class: 'text-muted' }, '—')
        const d = cur - prev
        if (d === 0)
          return h('span', { class: 'text-xs text-muted tabular-nums' }, '0')
        const up = d > 0
        return h('span', { class: `text-xs font-medium tabular-nums ${up ? 'text-success' : 'text-error'}` }, `${up ? '▲ +' : '▼ '}${d}`)
      },
    })
  }

  const CWV_COLS: { key: 'lcp' | 'cls' | 'tbt', label: string, unit: string }[] = [
    { key: 'lcp', label: 'LCP', unit: 'ms' },
    { key: 'cls', label: 'CLS', unit: '' },
    { key: 'tbt', label: 'TBT', unit: 'ms' },
  ]
  for (const m of CWV_COLS) {
    cols.push({
      id: m.key,
      accessorFn: (row: RouteRow) => (row[m.key] as number | null) ?? undefined,
      header: m.label,
      sortUndefined: 'last',
      meta: { align: 'right', headClass: 'w-20' },
      cell: ({ row }) => h('span', { class: `tabular-nums text-xs font-medium ${cwvColor(m.key, row.original[m.key] as number | null)}` }, formatMetric(row.original[m.key] as number | null, m.unit)),
    })
  }

  return cols
})
</script>

<template>
  <div class="space-y-4">
    <!-- Scan context strip -->
    <div v-if="filtered.length" class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
        <span class="font-semibold tabular-nums">{{ summary.count }} routes</span>
        <span class="flex items-center gap-1.5">
          <span class="size-2 rounded-full" :style="{ backgroundColor: score100Color(summary.avg) }" />
          avg <span class="font-semibold tabular-nums">{{ summary.avg ?? '—' }}</span>
        </span>
        <span class="text-muted text-xs tabular-nums">
          <span class="text-success font-medium">{{ summary.pass }}</span> pass ·
          <span class="text-warning font-medium">{{ summary.needs }}</span> needs work ·
          <span class="text-error font-medium">{{ summary.poor }}</span> poor
        </span>
        <span class="flex items-center gap-1 text-muted">
          <Icon v-for="d in summary.devices" :key="d" :name="d === 'mobile' ? 'lucide:smartphone' : 'lucide:monitor'" class="size-3.5" />
        </span>
      </div>
      <button class="text-xs text-muted hover:text-default transition-colors" @click="showAllMetrics = !showAllMetrics">
        {{ showAllMetrics ? 'Fewer metrics' : 'More metrics' }}
      </button>
    </div>

    <!-- Core Web Vitals — professional metric header (p75 + distribution +
         percentiles across the visible routes). -->
    <div v-if="filtered.length" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <MetricStatCard label="Largest Contentful Paint" :values="filtered.map(r => r.lcp)" :thresholds="[2500, 4000]" :format="(v: number) => formatMetric(v, 'ms')" />
      <MetricStatCard label="Cumulative Layout Shift" :values="filtered.map(r => r.cls)" :thresholds="[0.1, 0.25]" :format="(v: number) => v.toFixed(3)" />
      <MetricStatCard label="Total Blocking Time" :values="filtered.map(r => r.tbt)" :thresholds="[200, 600]" :format="(v: number) => formatMetric(v, 'ms')" />
      <template v-if="showAllMetrics">
        <MetricStatCard label="First Contentful Paint" :values="filtered.map(r => r.fcp)" :thresholds="[1800, 3000]" :format="(v: number) => formatMetric(v, 'ms')" />
        <MetricStatCard label="Speed Index" :values="filtered.map(r => r.si)" :thresholds="[3400, 5800]" :format="(v: number) => formatMetric(v, 'ms')" />
        <MetricStatCard label="Time to First Byte" :values="filtered.map(r => r.ttfb)" :thresholds="[800, 1800]" :format="(v: number) => formatMetric(v, 'ms')" />
      </template>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center gap-3 flex-wrap">
      <UInput v-model="q" icon="i-lucide-search" placeholder="Filter by URL..." class="flex-1 max-w-xs min-w-[180px]" />

      <!-- Quick filters -->
      <div class="flex items-center rounded-md border p-0.5">
        <button
          v-for="f in QUICK_FILTERS"
          :key="f.key"
          type="button"
          class="px-2.5 py-1 text-xs rounded transition-colors"
          :class="quick === f.key ? 'bg-elevated font-medium text-default' : 'text-muted hover:text-default'"
          @click="quick = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <UBadge color="neutral" variant="soft" class="text-xs tabular-nums">
        {{ filtered.length }}<span v-if="filtered.length !== total" class="text-muted/70"> / {{ total }}</span>
      </UBadge>

      <div class="flex-1" />

      <USelect
        v-if="hasMultipleDevices"
        v-model="deviceFilter"
        :items="[
          { label: 'All Devices', value: 'all' },
          { label: 'Mobile', value: 'mobile', icon: 'i-lucide-smartphone' },
          { label: 'Desktop', value: 'desktop', icon: 'i-lucide-monitor' },
        ]"
        class="w-36"
      />

      <UDropdownMenu :items="columnToggleItems" :content="{ align: 'end' }" :ui="{ content: 'w-44' }">
        <UButton color="neutral" variant="outline" size="sm" icon="i-lucide-columns-3" label="Columns" />
      </UDropdownMenu>

      <UButton
        color="neutral"
        variant="outline"
        size="sm"
        :title="density === 'compact' ? 'Comfortable rows' : 'Compact rows'"
        :icon="density === 'compact' ? 'i-lucide-rows-3' : 'i-lucide-rows-2'"
        @click="density = density === 'compact' ? 'comfortable' : 'compact'"
      />
    </div>

    <DataTable
      ref="tableRef"
      v-model:sorting="sorting"
      :columns="columns"
      :data="filtered"
      :density="density"
      sticky-header
      container-class="rounded-lg border overflow-auto max-h-[72vh]"
      row-clickable
      @row-click="openRoute"
    >
      <template #actions="{ row }">
        <UDropdownMenu
          :items="[
            { label: 'View details', icon: 'i-lucide-bar-chart-3', onSelect: () => openRoute(row) },
            { label: 'Open page', icon: 'i-lucide-external-link', to: row.url, target: '_blank' },
            { label: 'Copy URL', icon: 'i-lucide-copy', onSelect: () => copyRouteUrl(row) },
            { type: 'separator' },
            { label: 'Rescan route', icon: 'i-lucide-refresh-cw', onSelect: () => rescanRoute(row) },
          ]"
          :content="{ align: 'end' }"
        >
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-ellipsis" class="size-7 p-0" @click.stop />
        </UDropdownMenu>
      </template>

      <template #empty>
        <p v-if="store.isActive">Routes will appear as they are scanned...</p>
        <p v-else-if="q || quick !== 'all'">No routes match the current filter.</p>
        <p v-else>No routes found.</p>
      </template>
    </DataTable>

    <p v-if="truncated" class="text-xs text-muted">
      Showing the first {{ allRows.length }} of {{ total }} routes.
    </p>
  </div>
</template>
