<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
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
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useScanStore } from '~/stores/scan'

definePageMeta({ layout: 'scan' })

const route = useRoute()
const router = useRouter()
const api = useApi()
const store = useScanStore()
const scanId = computed(() => route.params.scanId as string)
const { scoreToColor, scoreToLabel } = useScoreColor()
const config = useRuntimeConfig()
const baseUrl = config.public.unlighthouseApiUrl as string

const page = ref(1)
const pageSize = 50
const urlFilter = ref('')
const deviceFilter = ref<string>('')
const serverSort = ref('score-asc')

// Table chrome: row density + column visibility (driven through the DataTable's
// exposed TanStack instance).
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
  router.push(`/sites/${route.params.siteId}/scans/${scanId.value}/route/${encodeURIComponent(r.path || r.url)}`)
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

// Server-sorted via the sort Select, so every column disables client
// sorting. Alignment / header widths ride on TanStack column `meta`;
// the shared DataTable renders the header/body loops and empty row.
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
          // Endpoint 404s when no screenshot blob exists — hide the broken
          // image marker so the column stays clean for non-audited rows.
          onError: (e: Event) => { (e.target as HTMLImageElement).style.visibility = 'hidden' },
        })
      },
    },
    {
      accessorKey: 'path',
      header: 'Path',
      enableSorting: false,
      meta: { headClass: 'min-w-[200px]' },
      cell: ({ row }) => h('span', { class: 'font-mono text-xs truncate block max-w-xs' }, row.original.path || row.original.url),
    },
  ]

  if (hasMultipleDevices.value && !deviceFilter.value) {
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
      accessorKey: s.key,
      header: s.label,
      enableSorting: false,
      meta: { align: 'center', headClass: 'w-16' },
      cell: ({ row }) => {
        const score = row.original[s.key] as number | null
        return h('span', { class: `text-xs font-bold tabular-nums ${scoreToColor(score)}` }, scoreToLabel(score))
      },
    })
  }

  cols.push(
    {
      accessorKey: 'lcp',
      header: 'LCP',
      enableSorting: false,
      meta: { align: 'right', headClass: 'w-20' },
      cell: ({ row }) => h('span', { class: 'tabular-nums text-xs text-muted-foreground' }, formatMetric(row.original.lcp)),
    },
    {
      accessorKey: 'cls',
      header: 'CLS',
      enableSorting: false,
      meta: { align: 'right', headClass: 'w-20' },
      cell: ({ row }) => h('span', { class: 'tabular-nums text-xs text-muted-foreground' }, formatMetric(row.original.cls, '')),
    },
    {
      accessorKey: 'tbt',
      header: 'TBT',
      enableSorting: false,
      meta: { align: 'right', headClass: 'w-20' },
      cell: ({ row }) => h('span', { class: 'tabular-nums text-xs text-muted-foreground' }, formatMetric(row.original.tbt)),
    },
  )

  return cols
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

      <!-- Column visibility -->
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

      <!-- Density -->
      <Button
        variant="outline"
        size="sm"
        :title="density === 'compact' ? 'Comfortable rows' : 'Compact rows'"
        @click="density = density === 'compact' ? 'comfortable' : 'compact'"
      >
        <Icon :name="density === 'compact' ? 'lucide:rows-3' : 'lucide:rows-2'" class="size-4" />
      </Button>
    </div>

    <!-- DataTable -->
    <DataTable
      ref="tableRef"
      :columns="columns"
      :data="(scanResults?.items ?? []) as RouteRow[]"
      :density="density"
      sticky-header
      container-class="rounded-lg border overflow-auto max-h-[72vh]"
      row-clickable
      @row-click="openRoute"
    >
      <template #empty>
        <p v-if="store.isActive">Routes will appear as they are scanned...</p>
        <p v-else>No routes found.</p>
      </template>
    </DataTable>

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
