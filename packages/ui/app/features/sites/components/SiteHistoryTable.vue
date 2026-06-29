<script setup lang="ts">
// Per-site scan-history table — TanStack-powered, dual-device score columns.
// Each instance owns its own sort state so groups don't interfere.

import type { ColumnDef, SortingState } from '@tanstack/vue-table'
import { h } from 'vue'

import type { DevicePair, ScanRow } from '../scan-pairs'

const props = defineProps<{
  pairs: DevicePair[]
}>()
const emit = defineEmits<{
  (e: 'rescan', scanId: string): void
  (e: 'delete', scanId: string): void
  (e: 'open', pair: DevicePair): void
}>()

const { scoreToColor } = useScoreColor()

const UBadgeC = resolveComponent('UBadge')

function categoryPct(scan: ScanRow | null, key: string): number | null {
  // The typed contract narrows scoresByCategory to a Partial<Record<Category, number>>;
  // this helper takes a free-form string key, so widen the lookup
  // surface explicitly. Cleaner than constraining `key` to Category
  // for a single dynamic call site.
  const raw = (scan?.summary?.scoresByCategory as Record<string, number | undefined> | undefined)?.[key]
  return raw == null ? null : Math.round(raw * 100)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}
function relTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.round(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

const sorting = ref<SortingState>([{ id: 'startedAt', desc: true }])

const columns: ColumnDef<DevicePair>[] = [
  {
    id: 'startedAt',
    accessorFn: row => row.startedAt,
    header: 'Date',
    cell: ({ row }) => h('div', { class: 'flex flex-col' }, [
      h('span', { class: 'text-sm' }, formatDate(row.original.startedAt)),
      h('span', { class: 'text-[10px] text-muted' }, relTime(row.original.startedAt)),
    ]),
    sortingFn: (a, b) => a.original.startedAt.localeCompare(b.original.startedAt),
  },
  {
    id: 'routes',
    // accessorFn (not just sortingFn) is what makes a column sortable —
    // TanStack disables sorting on accessor-less display columns.
    accessorFn: row => row.completed ?? 0,
    header: 'Routes',
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
        title: isEmpty ? 'Scan completed structurally but no routes were audited' : `${done} of ${all} pages audited`,
      }, label)
    },
    sortingFn: (a, b) => (a.original.completed ?? 0) - (b.original.completed ?? 0),
  },
  ...(['performance', 'accessibility', 'best-practices', 'seo'] as const).map(key => ({
    id: key,
    accessorFn: (row: DevicePair) => Math.max(categoryPct(row.mobile, key) ?? -1, categoryPct(row.desktop, key) ?? -1),
    meta: { align: 'center' },
    header: () => {
      const label = key === 'best-practices' ? 'Best' : key === 'performance' ? 'Perf' : key === 'accessibility' ? 'A11y' : 'SEO'
      return h('div', { class: 'text-center' }, [
        h('div', { class: 'text-xs font-semibold' }, label),
        h('div', { class: 'text-micro text-muted font-normal mt-0.5' }, 'M | D'),
      ])
    },
    cell: ({ row }: any) => {
      const m = categoryPct(row.original.mobile, key)
      const d = categoryPct(row.original.desktop, key)
      return h('div', { class: 'flex items-center justify-center gap-1.5 tabular-nums text-sm font-medium' }, [
        h('span', { class: m == null ? 'text-muted/50' : scoreToColor(m / 100) }, m ?? '—'),
        h('span', { class: 'text-muted/30 text-xs' }, '|'),
        h('span', { class: d == null ? 'text-muted/50' : scoreToColor(d / 100) }, d ?? '—'),
      ])
    },
    sortingFn: (a: any, b: any) => {
      const aMax = Math.max(categoryPct(a.original.mobile, key) ?? -1, categoryPct(a.original.desktop, key) ?? -1)
      const bMax = Math.max(categoryPct(b.original.mobile, key) ?? -1, categoryPct(b.original.desktop, key) ?? -1)
      return aMax - bMax
    },
  } satisfies ColumnDef<DevicePair>)),
  {
    id: 'status',
    header: 'Status',
    enableSorting: false,
    meta: { align: 'center', headClass: 'w-24' },
    cell: ({ row }) => {
      const s = statusForPair(row.original)
      return h(UBadgeC, { color: s.color, variant: s.variant, class: 'text-[10px] capitalize' }, () => s.label)
    },
  },
]

function primaryScanId(pair: DevicePair): string {
  return pair.mobile?.scanId ?? pair.desktop?.scanId ?? ''
}
function statusForPair(pair: DevicePair): { label: string, color: 'primary' | 'error' | 'neutral', variant: 'solid' | 'soft' | 'outline' } {
  const m = pair.mobile?.status
  const d = pair.desktop?.status
  const anyComplete = (m === 'complete' && (pair.mobile?.summary?.completed ?? 0) > 0)
    || (d === 'complete' && (pair.desktop?.summary?.completed ?? 0) > 0)
  if (anyComplete) return { label: 'complete', color: 'primary', variant: 'solid' }
  if ((m === 'complete' && (pair.mobile?.summary?.completed ?? 0) === 0)
    || (d === 'complete' && (pair.desktop?.summary?.completed ?? 0) === 0))
    return { label: 'no data', color: 'neutral', variant: 'outline' }
  if (m === 'error' || d === 'error' || m === 'cancelled' || d === 'cancelled')
    return { label: 'failed', color: 'error', variant: 'soft' }
  return { label: m || d || 'pending', color: 'neutral', variant: 'soft' }
}
</script>

<template>
  <DataTable
    v-model:sorting="sorting"
    :columns="columns"
    :data="pairs"
    container-class=""
    row-clickable
    @row-click="(p: DevicePair) => emit('open', p)"
  >
    <template #actions="{ row }">
      <div class="flex items-center justify-end gap-0.5">
        <UiButton purpose="quiet" size="sm" icon="i-lucide-refresh-cw" title="Rescan" @click="emit('rescan', primaryScanId(row))" />
        <UModal
          title="Delete scan?"
          description="This will permanently delete this scan and all its data. This cannot be undone."
        >
          <UButton color="neutral" variant="ghost" size="sm" icon="i-lucide-trash-2" />
          <template #footer="{ close }">
            <UiButton purpose="quiet" @click="close">Cancel</UiButton>
            <UiButton purpose="danger" @click="() => { emit('delete', primaryScanId(row)); close() }">Delete</UiButton>
          </template>
        </UModal>
      </div>
    </template>
  </DataTable>
</template>
