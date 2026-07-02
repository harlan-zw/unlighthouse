<script setup lang="ts">
import type { ColumnDef } from '@tanstack/vue-table'
import type { RouteRow } from '~/features/scan/routes-table'
import { createScreenshotUrl } from '~/features/scan/route-context'
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

const { scoreToColor, scoreToLabel } = createScoreColorHelpers()
const screenshotUrl = createScreenshotUrl()
const {
  store,
  scanId,
  allRows,
  total,
  truncated,
  prevMap,
  hasPrev,
  hasMultipleDevices,
  hasMultipleAuditors,
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
  resultsError,
  refresh,
} = useScanRoutesTable()

const overallScore = overallRouteScore
const formatMetric = formatRouteMetric
const UiIconC = resolveComponent('UiIcon')
const UiChipC = resolveComponent('UiChip')

const columns = computed<ColumnDef<RouteRow>[]>(() => {
  const cols: ColumnDef<RouteRow>[] = [
    {
      id: 'thumbnail',
      header: '',
      enableSorting: false,
      headClass: 'w-[140px]',
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
      headClass: 'min-w-[200px]',
      cell: ({ row }) => h('span', { class: 'font-mono text-xs truncate block max-w-xs' }, row.original.path || row.original.url),
    },
  ]

  if (hasMultipleDevices.value && deviceFilter.value === 'all') {
    cols.push({
      accessorKey: 'device',
      header: 'Device',
      enableSorting: false,
      align: 'center',
      headClass: 'w-16',
      cell: ({ row }) => h(UiIconC, {
        name: row.original.device === 'mobile' ? 'smartphone' : 'monitor',
        class: 'size-3.5 text-muted',
      }),
    })
  }

  // D-040: auditor backend column — only when the scan mixed >1 distinct
  // backend (single-backend scans stay clean, no visual noise).
  if (hasMultipleAuditors.value) {
    cols.push({
      accessorKey: 'auditor',
      header: 'Auditor',
      enableSorting: false,
      align: 'center',
      headClass: 'w-20',
      cell: ({ row }) => {
        const auditor = row.original.auditor
        if (!auditor)
          return h('span', { class: 'text-muted' }, '—')
        return h(UiChipC, { purpose: 'tag', size: 'xs', mono: true }, () => auditor)
      },
    })
  }

  for (const s of SCORE_COLS) {
    cols.push({
      id: s.key,
      accessorFn: (row: RouteRow) => (row[s.key] as number | null) ?? undefined,
      header: s.label,
      sortUndefined: 'last',
      align: 'center',
      headClass: 'w-16',
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
      align: 'right',
      headClass: 'w-16',
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
      align: 'right',
      headClass: 'w-20',
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
          <UiIcon v-for="d in summary.devices" :key="d" :name="d === 'mobile' ? 'smartphone' : 'monitor'" class="size-3.5" />
        </span>
      </div>
      <button class="min-h-11 px-2 -mx-2 text-xs text-muted hover:text-default transition-colors lg:min-h-0 lg:px-0 lg:mx-0" @click="showAllMetrics = !showAllMetrics">
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
      <UInput
        v-model="q"
        icon="search"
        placeholder="Filter by URL..."
        aria-label="Filter routes by URL"
        class="flex-1 max-w-xs min-w-[180px]"
        :ui="{ base: 'min-h-11 lg:min-h-8' }"
      />

      <!-- Quick filters -->
      <div class="flex items-center rounded-md border p-0.5">
        <button
          v-for="f in QUICK_FILTERS"
          :key="f.key"
          type="button"
          class="min-h-11 min-w-11 px-2.5 py-1 text-xs rounded transition-colors lg:min-h-0 lg:min-w-0"
          :class="quick === f.key ? 'bg-elevated font-medium text-default' : 'text-muted hover:text-default'"
          @click="quick = f.key"
        >
          {{ f.label }}
        </button>
      </div>

      <UiChip purpose="count" size="sm" tabular>
        {{ filtered.length }}<span v-if="filtered.length !== total" class="text-muted/70"> / {{ total }}</span>
      </UiChip>

      <div class="flex-1" />

      <USelect
        v-if="hasMultipleDevices"
        v-model="deviceFilter"
        :items="[
          { label: 'All Devices', value: 'all' },
          { label: 'Mobile', value: 'mobile', icon: 'smartphone' },
          { label: 'Desktop', value: 'desktop', icon: 'monitor' },
        ]"
        class="w-36"
      />

      <UDropdownMenu :items="columnToggleItems" :content="{ align: 'end' }" :ui="{ content: 'w-44' }">
        <UiButton purpose="secondary" size="sm" icon="table" label="Columns" />
      </UDropdownMenu>

      <UiButton
        purpose="secondary"
        size="sm"
        :title="density === 'compact' ? 'Comfortable rows' : 'Compact rows'"
        :icon="density === 'compact' ? 'list' : 'table'"
        aria-label="Toggle row density"
        @click="density = density === 'compact' ? 'comfortable' : 'compact'"
      />
    </div>

    <QueryError :error="resultsError" :on-retry="refresh" />

    <div class="border-y">
      <UiTable
        ref="tableRef"
        v-model:sorting="sorting"
        :columns="columns"
        :data="filtered"
        :size="density === 'compact' ? 'sm' : 'md'"
        enable-sorting
        :page-size="500"
        row-clickable
        @row-click="openRoute"
      >
        <template #actions="{ row }">
          <UDropdownMenu
            :items="[
              { label: 'View details', icon: 'chart-bar', onSelect: () => openRoute(row) },
              { label: 'Open page', icon: 'external', to: row.url, target: '_blank' },
              { label: 'Copy URL', icon: 'copy', onSelect: () => copyRouteUrl(row) },
              { type: 'separator' },
              { label: 'Rescan route', icon: 'refresh', onSelect: () => rescanRoute(row) },
            ]"
            :content="{ align: 'end' }"
          >
            <UiButton purpose="quiet" size="sm" icon="more-horizontal" class="size-7 p-0 justify-center" aria-label="Route actions" @click.stop />
          </UDropdownMenu>
        </template>

        <template #empty-component>
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
      </UiTable>
    </div>

    <p v-if="truncated" class="text-xs text-muted">
      Showing the first {{ allRows.length }} of {{ total }} routes.
    </p>
  </div>
</template>
