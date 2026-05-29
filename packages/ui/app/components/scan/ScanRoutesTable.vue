<script setup lang="ts">
// The advanced scan-routes table. Loads every route for the scan once (≤500)
// and does filtering + sorting client-side, so every column header sorts
// instantly (the server only sorts overall score + CWV) and quick filters
// apply across all routes, not just a page. Web-vitals cells are coloured by
// Google's good/needs-work/poor thresholds; screenshot thumbs, device split,
// column visibility, density and a sticky header round it out.
import type { ColumnDef, SortingState } from '@tanstack/vue-table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { toast } from 'vue-sonner'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useScanStore } from '~/stores/scan'

const router = useRouter()
const route = useRoute()
const api = useApi()
const store = useScanStore()
const { scanId, scanBase } = useScanBase()
const { scoreToColor, scoreToLabel } = useScoreColor()
const baseUrl = useRuntimeConfig().public.unlighthouseApiUrl as string

// Load the whole scan once; everything below is client-side. 500 is the
// scan.results cap — past that we note the truncation.
const { data: scanResults, refresh } = useAsyncData(
  `scan-routes-table-${scanId.value}`,
  () => api['scan.results']({ scanId: scanId.value, page: 1, pageSize: 500 }).catch(() => null),
  { watch: [scanId] },
)
useScanWebsocket({ 'scan:complete': refresh })

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
  if (v == null) return 'text-muted-foreground'
  const [good, poor] = CWV_THRESHOLDS[metric]!
  return v <= good ? 'text-green-500' : v <= poor ? 'text-orange-500' : 'text-red-500'
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
const colLabels: Record<string, string> = {
  thumbnail: 'Thumbnail',
  path: 'Path',
  device: 'Device',
  scorePerformance: 'Performance',
  scoreAccessibility: 'Accessibility',
  scoreSeo: 'SEO',
  scoreBestPractices: 'Best Practices',
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
        const src = `${baseUrl}/dashboard/screenshot/${scanId.value}/${encodeURIComponent(path)}`
        return h('img', {
          src,
          loading: 'lazy',
          alt: '',
          class: 'w-14 h-9 object-cover object-top rounded border bg-muted shrink-0',
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
        class: 'size-3.5 text-muted-foreground',
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
    <!-- Toolbar -->
    <div class="flex items-center gap-3 flex-wrap">
      <div class="relative flex-1 max-w-xs min-w-[180px]">
        <Icon name="lucide:search" class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input v-model="q" placeholder="Filter by URL..." class="pl-8" />
      </div>

      <!-- Quick filters -->
      <div class="flex items-center rounded-md border p-0.5">
        <button
          v-for="f in QUICK_FILTERS"
          :key="f.key"
          type="button"
          class="px-2.5 py-1 text-xs rounded transition-colors"
          :class="quick === f.key ? 'bg-muted font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'"
          @click="quick = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <Badge variant="secondary" class="text-xs tabular-nums">
        {{ filtered.length }}<span v-if="filtered.length !== total" class="text-muted-foreground/70"> / {{ total }}</span>
      </Badge>

      <div class="flex-1" />

      <Select v-if="hasMultipleDevices" v-model="deviceFilter">
        <SelectTrigger class="w-36">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All Devices</SelectItem>
          <SelectItem value="mobile">
            <div class="flex items-center gap-1.5">
              <Icon name="lucide:smartphone" class="size-3.5" /> Mobile
            </div>
          </SelectItem>
          <SelectItem value="desktop">
            <div class="flex items-center gap-1.5">
              <Icon name="lucide:monitor" class="size-3.5" /> Desktop
            </div>
          </SelectItem>
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm">
            <Icon name="lucide:columns-3" class="size-4 mr-1.5" />
            Columns
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-44">
          <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            v-for="col in (tableRef?.table?.getAllLeafColumns() ?? [])"
            :key="col.id"
            :model-value="col.getIsVisible()"
            @update:model-value="col.toggleVisibility()"
            @select="(e: Event) => e.preventDefault()"
          >
            {{ colLabels[col.id] ?? col.id }}
          </DropdownMenuCheckboxItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button
        variant="outline"
        size="sm"
        :title="density === 'compact' ? 'Comfortable rows' : 'Compact rows'"
        @click="density = density === 'compact' ? 'comfortable' : 'compact'"
      >
        <Icon :name="density === 'compact' ? 'lucide:rows-3' : 'lucide:rows-2'" class="size-4" />
      </Button>
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
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button variant="ghost" size="sm" class="size-7 p-0 text-muted-foreground hover:text-foreground" @click.stop>
              <Icon name="lucide:ellipsis" class="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" @click.stop>
            <DropdownMenuItem @click="openRoute(row)">
              <Icon name="lucide:bar-chart-3" class="size-4" />
              View details
            </DropdownMenuItem>
            <DropdownMenuItem as-child>
              <a :href="row.url" target="_blank" rel="noopener">
                <Icon name="lucide:external-link" class="size-4" />
                Open page
              </a>
            </DropdownMenuItem>
            <DropdownMenuItem @click="copyRouteUrl(row)">
              <Icon name="lucide:copy" class="size-4" />
              Copy URL
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem @click="rescanRoute(row)">
              <Icon name="lucide:refresh-cw" class="size-4" />
              Rescan route
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </template>

      <template #empty>
        <p v-if="store.isActive">Routes will appear as they are scanned...</p>
        <p v-else-if="q || quick !== 'all'">No routes match the current filter.</p>
        <p v-else>No routes found.</p>
      </template>
    </DataTable>

    <p v-if="truncated" class="text-xs text-muted-foreground">
      Showing the first {{ allRows.length }} of {{ total }} routes.
    </p>
  </div>
</template>
