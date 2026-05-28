<script setup lang="ts">
import type { ColumnDef, SortingState } from '@tanstack/vue-table'
import { FlexRender, getCoreRowModel, getSortedRowModel, useVueTable } from '@tanstack/vue-table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
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
import { useScanStore } from '~/stores/scan'

const route = useRoute()
const router = useRouter()
const api = useApi()
const store = useScanStore()
const scanId = computed(() => route.params.id as string)
const { scoreToColor, scoreToLabel } = useScoreColor()
const config = useRuntimeConfig()
const baseUrl = config.public.unlighthouseApiUrl as string

const page = ref(1)
const pageSize = 50
const urlFilter = ref('')
const deviceFilter = ref<string>('')
const serverSort = ref('score-asc')

const { data: scanResults, refresh } = useAsyncData(
  `scan-routes-${scanId.value}`,
  () => api['scan.results']({
    scanId: scanId.value,
    page: page.value,
    pageSize,
    sort: serverSort.value as any,
    device: deviceFilter.value || undefined,
    filter: urlFilter.value ? { urlPattern: urlFilter.value } : undefined,
  }).catch(() => null),
  { watch: [scanId, page, serverSort, urlFilter, deviceFilter] },
)

useScanWebsocket({ 'scan:complete': refresh })

const hasMultipleDevices = computed(() => {
  if (!scanResults.value?.items) return false
  const devices = new Set(scanResults.value.items.map((r: any) => r.device))
  return devices.size > 1
})

function formatMetric(value: number | null, unit: string = 'ms') {
  if (value === null) return '—'
  if (unit === 'ms') return value >= 1000 ? `${(value / 1000).toFixed(1)}s` : `${Math.round(value)}ms`
  return value.toFixed(3)
}

const totalPages = computed(() => {
  if (!scanResults.value) return 0
  return Math.ceil(scanResults.value.total / pageSize)
})

let filterTimeout: ReturnType<typeof setTimeout>
function onFilterInput(e: Event) {
  clearTimeout(filterTimeout)
  filterTimeout = setTimeout(() => {
    urlFilter.value = (e.target as HTMLInputElement).value
    page.value = 1
  }, 300)
}

function openRoute(r: any) {
  router.push(`/scan/${scanId.value}/route/${encodeURIComponent(r.path || r.url)}`)
}

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

const columns = computed<ColumnDef<RouteRow>[]>(() => {
  const cols: ColumnDef<RouteRow>[] = [
    {
      id: 'thumbnail',
      header: '',
      enableSorting: false,
      cell: ({ row }) => {
        const path = row.original.path || row.original.url
        const src = `${baseUrl}/dashboard/screenshot/${scanId.value}/${encodeURIComponent(path)}`
        return h('img', {
          src,
          loading: 'lazy',
          alt: '',
          class: 'w-14 h-9 object-cover object-top rounded border bg-muted shrink-0',
          // Endpoint 404s when no screenshot blob exists — hide the broken
          // image marker so the column stays clean for non-audited rows.
          onError: (e: Event) => { (e.target as HTMLImageElement).style.visibility = 'hidden' },
        })
      },
      size: 70,
    },
    {
      accessorKey: 'path',
      header: 'Path',
      cell: ({ row }) => h('span', { class: 'font-mono text-xs truncate block max-w-xs' }, row.original.path || row.original.url),
    },
  ]

  if (hasMultipleDevices.value && !deviceFilter.value) {
    cols.push({
      accessorKey: 'device',
      header: 'Device',
      cell: ({ row }) => h(resolveComponent('Icon'), {
        name: row.original.device === 'mobile' ? 'lucide:smartphone' : 'lucide:monitor',
        class: 'size-3.5 text-muted-foreground',
      }),
      size: 60,
    })
  }

  cols.push(
    {
      accessorKey: 'scorePerformance',
      header: 'Perf',
      cell: ({ row }) => {
        const score = row.original.scorePerformance
        return h('span', { class: `text-xs font-bold tabular-nums ${scoreToColor(score)}` }, scoreToLabel(score))
      },
      size: 60,
    },
    {
      accessorKey: 'scoreAccessibility',
      header: 'A11y',
      cell: ({ row }) => {
        const score = row.original.scoreAccessibility
        return h('span', { class: `text-xs font-bold tabular-nums ${scoreToColor(score)}` }, scoreToLabel(score))
      },
      size: 60,
    },
    {
      accessorKey: 'scoreSeo',
      header: 'SEO',
      cell: ({ row }) => {
        const score = row.original.scoreSeo
        return h('span', { class: `text-xs font-bold tabular-nums ${scoreToColor(score)}` }, scoreToLabel(score))
      },
      size: 60,
    },
    {
      accessorKey: 'scoreBestPractices',
      header: 'BP',
      cell: ({ row }) => {
        const score = row.original.scoreBestPractices
        return h('span', { class: `text-xs font-bold tabular-nums ${scoreToColor(score)}` }, scoreToLabel(score))
      },
      size: 60,
    },
    {
      accessorKey: 'lcp',
      header: 'LCP',
      cell: ({ row }) => h('span', { class: 'tabular-nums text-xs text-muted-foreground' }, formatMetric(row.original.lcp)),
      size: 80,
    },
    {
      accessorKey: 'cls',
      header: 'CLS',
      cell: ({ row }) => h('span', { class: 'tabular-nums text-xs text-muted-foreground' }, formatMetric(row.original.cls, '')),
      size: 60,
    },
    {
      accessorKey: 'tbt',
      header: 'TBT',
      cell: ({ row }) => h('span', { class: 'tabular-nums text-xs text-muted-foreground' }, formatMetric(row.original.tbt)),
      size: 80,
    },
  )

  return cols
})

const sorting = ref<SortingState>([])

const table = useVueTable({
  get data() { return (scanResults.value?.items ?? []) as RouteRow[] },
  get columns() { return columns.value },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  state: {
    get sorting() { return sorting.value },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
  manualPagination: true,
})

const sortOptions = [
  { value: 'score-asc', label: 'Score (low → high)' },
  { value: 'score-desc', label: 'Score (high → low)' },
  { value: 'lcp-desc', label: 'LCP (slowest)' },
  { value: 'cls-desc', label: 'CLS (worst)' },
  { value: 'tbt-desc', label: 'TBT (slowest)' },
  { value: 'ttfb-desc', label: 'TTFB (slowest)' },
  { value: 'url-asc', label: 'URL (A-Z)' },
  { value: 'capturedAt-desc', label: 'Most Recent' },
]
</script>

<template>
  <div class="space-y-4">
    <ScanNav />
    <div class="flex items-center gap-3">
      <h1 class="text-xl font-bold tracking-tight">Routes</h1>
      <Badge v-if="scanResults" variant="secondary" class="text-xs">{{ scanResults.total }} total</Badge>
    </div>

    <!-- Toolbar -->
    <div class="flex items-center gap-3 flex-wrap">
      <div class="relative flex-1 max-w-sm">
        <Icon name="lucide:search" class="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
        <Input placeholder="Filter by URL..." class="pl-8" :model-value="urlFilter" @input="onFilterInput" />
      </div>
      <Select v-if="hasMultipleDevices || deviceFilter" v-model="deviceFilter">
        <SelectTrigger class="w-36">
          <SelectValue placeholder="All Devices" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="">All Devices</SelectItem>
          <SelectItem value="mobile">
            <div class="flex items-center gap-1.5">
              <Icon name="lucide:smartphone" class="size-3.5" />
              Mobile
            </div>
          </SelectItem>
          <SelectItem value="desktop">
            <div class="flex items-center gap-1.5">
              <Icon name="lucide:monitor" class="size-3.5" />
              Desktop
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
      <Select v-model="serverSort">
        <SelectTrigger class="w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="opt in sortOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</SelectItem>
        </SelectContent>
      </Select>
    </div>

    <!-- DataTable -->
    <div class="rounded-lg border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
            <TableHead
              v-for="header in headerGroup.headers"
              :key="header.id"
              :class="[
                header.column.id === 'path' ? 'min-w-[200px]' : '',
                ['scorePerformance', 'scoreAccessibility', 'scoreSeo', 'scoreBestPractices', 'device'].includes(header.column.id) ? 'text-center w-16' : '',
                ['lcp', 'cls', 'tbt'].includes(header.column.id) ? 'text-right w-20' : '',
              ]"
            >
              <FlexRender :render="header.column.columnDef.header" :props="header.getContext()" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <template v-if="table.getRowModel().rows.length">
            <TableRow
              v-for="row in table.getRowModel().rows"
              :key="row.id"
              class="cursor-pointer hover:bg-muted/50"
              @click="openRoute(row.original)"
            >
              <TableCell
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                :class="[
                  ['scorePerformance', 'scoreAccessibility', 'scoreSeo', 'scoreBestPractices', 'device'].includes(cell.column.id) ? 'text-center' : '',
                  ['lcp', 'cls', 'tbt'].includes(cell.column.id) ? 'text-right' : '',
                ]"
              >
                <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </TableCell>
            </TableRow>
          </template>
          <template v-else>
            <TableRow>
              <TableCell :colspan="columns.length" class="text-center py-12 text-muted-foreground">
                <p v-if="store.isActive">Routes will appear as they are scanned...</p>
                <p v-else>No routes found.</p>
              </TableCell>
            </TableRow>
          </template>
        </TableBody>
      </Table>
    </div>

    <!-- Pagination -->
    <div v-if="totalPages > 1" class="flex items-center justify-between">
      <span class="text-sm text-muted-foreground">
        Page {{ page }} of {{ totalPages }} · {{ scanResults?.total ?? 0 }} routes
      </span>
      <div class="flex gap-1">
        <Button variant="outline" size="sm" :disabled="page <= 1" @click="page--">
          <Icon name="lucide:chevron-left" class="size-4" />
        </Button>
        <Button variant="outline" size="sm" :disabled="page >= totalPages" @click="page++">
          <Icon name="lucide:chevron-right" class="size-4" />
        </Button>
      </div>
    </div>
  </div>
</template>
