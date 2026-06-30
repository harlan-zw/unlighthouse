<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { RouteRow } from '~/features/scan/routes-table'
import { useScreenshotUrl } from '~/features/scan/route-context'
import {
  CWV_COLS,
  cwvColor,
  formatRouteMetric,
  overallRouteScore,
  QUICK_FILTERS,
  SCORE_COLS,
  useScanRoutesTable,
} from '~/features/scan/routes-table'
import MetricStatCard from './MetricStatCard.vue'

const { scoreToColor, scoreToLabel } = useScoreColor()
const screenshotUrl = useScreenshotUrl()
const {
  store,
  scanId,
  allRows,
  total,
  truncated,
  prevMap,
  hasPrev,
  hasMultipleDevices,
  q,
  deviceFilter,
  quick,
  filtered,
  showAllMetrics,
  summary,
  score100Color,
  sorting,
  density,
  tableRef,
  columnToggleItems,
  copyRouteUrl,
  rescanRoute,
  openRoute,
} = useScanRoutesTable()

const overallScore = overallRouteScore
const formatMetric = formatRouteMetric

const columns = computed<ColumnDef<RouteRow>[]>(() => {
  const cols: ColumnDef<RouteRow>[] = [
    {
      id: 'thumbnail',
      header: '',
      enableSorting: false,
      meta: { headClass: 'w-[140px]' },
      cell: ({ row }) => {
        const path = row.original.path || row.original.url
        const src = screenshotUrl(scanId.value, path)
        return h('img', {
          src,
          loading: 'lazy',
          alt: '',
          // Inline sizing (not just w-/h- classes) so the table's auto layout
          // can't squeeze the cell — full-page mobile screenshots are very tall,
          // object-cover/top crops to a clean wide thumbnail.
          class: 'object-cover object-top rounded-md border bg-elevated shrink-0',
          style: 'width:128px;height:80px;min-width:128px;max-width:128px',
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
      <MetricStatCard label="Largest Contentful Paint" :values="filtered.map(r => r.lcp)" :thresholds="CWV_THRESHOLDS.lcp" :format="(v: number) => formatMetric(v, 'ms')" />
      <MetricStatCard label="Cumulative Layout Shift" :values="filtered.map(r => r.cls)" :thresholds="CWV_THRESHOLDS.cls" :format="(v: number) => v.toFixed(3)" />
      <MetricStatCard label="Total Blocking Time" :values="filtered.map(r => r.tbt)" :thresholds="CWV_THRESHOLDS.tbt" :format="(v: number) => formatMetric(v, 'ms')" />
      <template v-if="showAllMetrics">
        <MetricStatCard label="First Contentful Paint" :values="filtered.map(r => r.fcp)" :thresholds="CWV_THRESHOLDS.fcp" :format="(v: number) => formatMetric(v, 'ms')" />
        <MetricStatCard label="Speed Index" :values="filtered.map(r => r.si)" :thresholds="CWV_THRESHOLDS.si" :format="(v: number) => formatMetric(v, 'ms')" />
        <MetricStatCard label="Time to First Byte" :values="filtered.map(r => r.ttfb)" :thresholds="CWV_THRESHOLDS.ttfb" :format="(v: number) => formatMetric(v, 'ms')" />
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
      container-class="border-y"
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
        <p v-if="store.isActive">
          Routes will appear as they are scanned...
        </p>
        <p v-else-if="q || quick !== 'all'">
          No routes match the current filter.
        </p>
        <p v-else>
          No routes found.
        </p>
      </template>
    </DataTable>

    <p v-if="truncated" class="text-xs text-muted">
      Showing the first {{ allRows.length }} of {{ total }} routes.
    </p>
  </div>
</template>
