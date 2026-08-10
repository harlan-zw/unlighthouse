<script setup lang="ts">
// Per-site scan-history table — TanStack-powered, dual-device score columns.
// Each instance owns its own sort state so groups don't interfere.

import type { SortingState } from '@tanstack/vue-table'
import type { ScanId } from '@unlighthouse/contracts'
import type { UiTableColumn } from '#layers/design-system/app/utils/ui-table'
import type { DevicePair, ScanRow } from '../scan-pairs'

import { h } from 'vue'
import { scoreSummaryForDevice, statusForPair } from '../scan-pairs'

defineProps<{
  pairs: DevicePair[]
  readonly?: boolean
}>()
const emit = defineEmits<{
  rescan: [scanId: ScanId]
  delete: [scanId: ScanId]
  open: [pair: DevicePair]
}>()

const { scoreToColor } = createScoreColorHelpers()
const { fmtRelTime, fmtTimestamp } = createFormatters()
const UiStatusBadgeC = resolveComponent('UiStatusBadge')

function categoryPct(scan: ScanRow | null, device: 'mobile' | 'desktop', key: string): number | null {
  // The typed contract narrows scoresByCategory to a Partial<Record<Category, number>>;
  // this helper takes a free-form string key, so widen the lookup
  // surface explicitly. Cleaner than constraining `key` to Category
  // for a single dynamic call site.
  const summary = scan ? scoreSummaryForDevice(scan, device) : null
  const raw = (summary?.scoresByCategory as Record<string, number | undefined> | undefined)?.[key]
  return raw == null ? null : Math.round(raw * 100)
}

const sorting = ref<SortingState>([{ id: 'startedAt', desc: true }])

const columns: UiTableColumn<DevicePair>[] = [
  {
    id: 'startedAt',
    accessorFn: row => row.startedAt,
    header: 'Date',
    cell: ({ row }) => h('div', { class: 'flex flex-col' }, [
      h('span', { class: 'text-sm' }, fmtTimestamp(row.original.startedAt, 'short')),
      h('span', { class: 'text-xs text-muted' }, fmtRelTime(row.original.startedAt)),
    ]),
    sortFn: (a, b) => a.original.startedAt.localeCompare(b.original.startedAt),
  },
  {
    id: 'routes',
    // accessorFn (not just sortFn) is what makes a column sortable —
    // TanStack disables sorting on accessor-less display columns.
    accessorFn: row => row.completed ?? 0,
    header: 'Audited / found',
    cell: ({ row }) => {
      const p = row.original
      const all = p.routes || 0
      const done = p.completed || 0
      const isEmpty = done === 0 && all > 0
      // When every found page was audited (the normal case), show one number —
      // "22/22" reads like something was skipped. Only show "done/all" when they
      // genuinely differ (older scans, or a scan that didn't finish).
      const label = all > 0 && done !== all ? `${done}/${all}` : `${done || all}`
      return h('span', {
        class: isEmpty ? 'text-xs tabular-nums text-muted' : 'text-xs tabular-nums',
        title: isEmpty ? 'Scan completed structurally but no URLs were audited' : `${done} audited of ${all} discovered URL and device entries`,
      }, label)
    },
    sortFn: (a, b) => (a.original.completed ?? 0) - (b.original.completed ?? 0),
  },
  ...(['performance', 'accessibility', 'best-practices', 'seo'] as const).map(key => ({
    id: key,
    accessorFn: (row: DevicePair) => Math.max(categoryPct(row.mobile, 'mobile', key) ?? -1, categoryPct(row.desktop, 'desktop', key) ?? -1),
    meta: { align: 'center' },
    header: () => {
      const label = key === 'best-practices' ? 'Best' : key === 'performance' ? 'Perf' : key === 'accessibility' ? 'A11y' : 'SEO'
      return h('div', { class: 'text-center' }, [
        h('div', { class: 'text-xs font-semibold' }, label),
        h('div', { class: 'text-xs text-muted font-normal mt-0.5' }, 'M | D'),
      ])
    },
    cell: ({ row }) => {
      const m = categoryPct(row.original.mobile, 'mobile', key)
      const d = categoryPct(row.original.desktop, 'desktop', key)
      return h('div', { class: 'flex items-center justify-center gap-1.5 tabular-nums text-sm font-medium' }, [
        h('span', { class: m == null ? 'text-muted/50' : scoreToColor(m / 100) }, m ?? '—'),
        h('span', { class: 'text-muted/30 text-xs' }, '|'),
        h('span', { class: d == null ? 'text-muted/50' : scoreToColor(d / 100) }, d ?? '—'),
      ])
    },
    sortFn: (a, b) => {
      const aMax = Math.max(categoryPct(a.original.mobile, 'mobile', key) ?? -1, categoryPct(a.original.desktop, 'desktop', key) ?? -1)
      const bMax = Math.max(categoryPct(b.original.mobile, 'mobile', key) ?? -1, categoryPct(b.original.desktop, 'desktop', key) ?? -1)
      return aMax - bMax
    },
  } satisfies UiTableColumn<DevicePair>)),
  {
    id: 'status',
    header: 'Status',
    enableSorting: false,
    meta: { align: 'center', headClass: 'w-24' },
    cell: ({ row }) => {
      const s = statusForPair(row.original)
      return h(UiStatusBadgeC, { status: s.status, label: s.label, class: 'capitalize' })
    },
  },
]

function primaryScanId(pair: DevicePair): ScanId {
  const scanId = pair.mobile?.scanId ?? pair.desktop?.scanId
  if (!scanId)
    throw new TypeError('A device pair must contain at least one scan.')
  return scanId
}
</script>

<template>
  <UiTable
    v-model:sorting="sorting"
    :columns="columns"
    :data="pairs"
    enable-sorting
    disable-pagination
    row-clickable
    @row-click="(p: DevicePair) => emit('open', p)"
  >
    <template #actions="{ row }">
      <div v-if="!readonly" class="flex items-center justify-end gap-0.5">
        <UiButton purpose="quiet" size="sm" icon="refresh" :aria-label="`Rescan from ${fmtTimestamp(row.startedAt, 'short')}`" @click="emit('rescan', primaryScanId(row))" />
        <UModal
          title="Delete scan?"
          description="This will permanently delete this scan and all its data. This cannot be undone."
        >
          <UiButton purpose="quiet" size="sm" icon="delete" :aria-label="`Delete scan from ${fmtTimestamp(row.startedAt, 'short')}`" />
          <template #footer="{ close }">
            <UiButton purpose="quiet" @click="close">
              Keep scan
            </UiButton>
            <UiButton purpose="danger" @click="() => { emit('delete', primaryScanId(row)); close() }">
              Delete scan
            </UiButton>
          </template>
        </UModal>
      </div>
    </template>
  </UiTable>
</template>
