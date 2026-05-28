<script setup lang="ts">
// Per-site scan-history table — TanStack-powered, dual-device score columns.
// Each instance owns its own sort state so groups don't interfere.

import type { ColumnDef, SortingState } from '@tanstack/vue-table'
import { FlexRender, getCoreRowModel, getSortedRowModel, useVueTable } from '@tanstack/vue-table'
import { h } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import {
  AlertDialog,
  AlertDialogAction, AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'

import type { DevicePair, ScanRow } from './types'

const props = defineProps<{
  pairs: DevicePair[]
}>()
const emit = defineEmits<{
  (e: 'rescan', scanId: string): void
  (e: 'delete', scanId: string): void
  (e: 'open', pair: DevicePair): void
}>()

const { scoreToColor } = useScoreColor()

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
      h('span', { class: 'text-[10px] text-muted-foreground' }, relTime(row.original.startedAt)),
    ]),
    sortingFn: (a, b) => a.original.startedAt.localeCompare(b.original.startedAt),
  },
  {
    id: 'routes',
    header: 'Routes',
    cell: ({ row }) => {
      const p = row.original
      const all = p.routes || 0
      const done = p.completed || 0
      const isEmpty = done === 0 && all > 0
      return h('span', {
        class: isEmpty ? 'text-xs tabular-nums text-muted-foreground' : 'text-xs tabular-nums',
        title: isEmpty ? 'Scan completed structurally but no routes were audited' : `${done} of ${all} routes audited`,
      }, `${done}/${all}`)
    },
    sortingFn: (a, b) => (a.original.completed ?? 0) - (b.original.completed ?? 0),
  },
  ...(['performance', 'accessibility', 'best-practices', 'seo'] as const).map(key => ({
    id: key,
    header: () => {
      const label = key === 'best-practices' ? 'Best' : key === 'performance' ? 'Perf' : key === 'accessibility' ? 'A11y' : 'SEO'
      return h('div', { class: 'text-center' }, [
        h('div', { class: 'text-xs font-semibold' }, label),
        h('div', { class: 'text-[9px] text-muted-foreground font-normal mt-0.5 tracking-wider' }, 'M | D'),
      ])
    },
    cell: ({ row }: any) => {
      const m = categoryPct(row.original.mobile, key)
      const d = categoryPct(row.original.desktop, key)
      return h('div', { class: 'flex items-center justify-center gap-1.5 tabular-nums text-sm font-medium' }, [
        h('span', { class: m == null ? 'text-muted-foreground/50' : scoreToColor(m / 100) }, m ?? '—'),
        h('span', { class: 'text-muted-foreground/30 text-xs' }, '|'),
        h('span', { class: d == null ? 'text-muted-foreground/50' : scoreToColor(d / 100) }, d ?? '—'),
      ])
    },
    sortingFn: (a: any, b: any) => {
      const aMax = Math.max(categoryPct(a.original.mobile, key) ?? -1, categoryPct(a.original.desktop, key) ?? -1)
      const bMax = Math.max(categoryPct(b.original.mobile, key) ?? -1, categoryPct(b.original.desktop, key) ?? -1)
      return aMax - bMax
    },
  } satisfies ColumnDef<DevicePair>)),
]

const table = useVueTable({
  get data() { return props.pairs },
  columns,
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  state: {
    get sorting() { return sorting.value },
  },
  onSortingChange: (updater) => {
    sorting.value = typeof updater === 'function' ? updater(sorting.value) : updater
  },
})

function primaryScanId(pair: DevicePair): string {
  return pair.mobile?.scanId ?? pair.desktop?.scanId ?? ''
}
function statusForPair(pair: DevicePair): { label: string, variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  const m = pair.mobile?.status
  const d = pair.desktop?.status
  const anyComplete = (m === 'complete' && (pair.mobile?.summary?.completed ?? 0) > 0)
    || (d === 'complete' && (pair.desktop?.summary?.completed ?? 0) > 0)
  if (anyComplete) return { label: 'complete', variant: 'default' }
  if ((m === 'complete' && (pair.mobile?.summary?.completed ?? 0) === 0)
    || (d === 'complete' && (pair.desktop?.summary?.completed ?? 0) === 0))
    return { label: 'no data', variant: 'outline' }
  if (m === 'error' || d === 'error' || m === 'cancelled' || d === 'cancelled')
    return { label: 'failed', variant: 'destructive' }
  return { label: m || d || 'pending', variant: 'secondary' }
}
</script>

<template>
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead
          v-for="header in table.getHeaderGroups()[0]?.headers"
          :key="header.id"
          :class="header.column.getCanSort() ? 'cursor-pointer select-none' : ''"
          @click="header.column.getToggleSortingHandler()?.($event)"
        >
          <div class="flex items-center gap-1.5">
            <FlexRender v-if="!header.isPlaceholder" :render="header.column.columnDef.header" :props="header.getContext()" />
            <Icon
              v-if="header.column.getCanSort()"
              :name="
                header.column.getIsSorted() === 'asc' ? 'lucide:arrow-up'
                : header.column.getIsSorted() === 'desc' ? 'lucide:arrow-down'
                  : 'lucide:chevrons-up-down'
              "
              class="size-3 text-muted-foreground/60"
            />
          </div>
        </TableHead>
        <TableHead class="w-24 text-center">
          Status
        </TableHead>
        <TableHead class="w-20" />
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow
        v-for="row in table.getRowModel().rows"
        :key="row.id"
        class="cursor-pointer"
        @click="emit('open', row.original)"
      >
        <TableCell
          v-for="cell in row.getVisibleCells()"
          :key="cell.id"
        >
          <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
        </TableCell>
        <TableCell class="text-center">
          <Badge :variant="statusForPair(row.original).variant" class="text-[10px] capitalize">
            {{ statusForPair(row.original).label }}
          </Badge>
        </TableCell>
        <TableCell class="text-right" @click.stop>
          <div class="flex items-center justify-end gap-0.5">
            <Button
              variant="ghost"
              size="sm"
              class="size-7 p-0 text-muted-foreground hover:text-foreground"
              title="Rescan"
              @click="emit('rescan', primaryScanId(row.original))"
            >
              <Icon name="lucide:refresh-cw" class="size-3.5" />
            </Button>
            <AlertDialog>
              <AlertDialogTrigger as-child>
                <Button variant="ghost" size="sm" class="size-7 p-0 text-muted-foreground hover:text-destructive">
                  <Icon name="lucide:trash-2" class="size-3.5" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete scan?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete this scan and all its data. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction @click="emit('delete', primaryScanId(row.original))">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </TableCell>
      </TableRow>
    </TableBody>
  </Table>
</template>
