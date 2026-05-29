<script setup lang="ts" generic="T">
// Reusable TanStack-powered table. Pages own their column defs, data,
// toolbar and pagination; this component owns the repetitive bits that
// every table shared before it existed: the header/body FlexRender loops,
// sort-toggle headers, alignment, the empty row, and row-click wiring.
//
// Column alignment / per-cell classes ride on TanStack's `meta`:
//   { meta: { align: 'center' | 'right', headClass, cellClass } }
//
// Sorting is v-model-able. Pass `manual-sorting` for server-side sort
// (the table won't reorder rows itself; it just reflects/emits state).
import type { ColumnDef, SortingState } from '@tanstack/vue-table'
import { FlexRender, getCoreRowModel, getSortedRowModel, useVueTable } from '@tanstack/vue-table'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'

interface ColMeta {
  align?: 'center' | 'right'
  headClass?: string
  cellClass?: string
}

const props = withDefaults(defineProps<{
  columns: ColumnDef<T, any>[]
  data: T[]
  /** Controlled sorting state (v-model:sorting). Omit for uncontrolled. */
  sorting?: SortingState
  /** Server-side sort: reflect/emit sort state without reordering rows. */
  manualSorting?: boolean
  getRowId?: (row: T, index: number) => string
  /** Apply hover/cursor affordance and emit `row-click`. */
  rowClickable?: boolean
  rowClass?: (row: T) => string
  emptyText?: string
  /** Classes for the scroll/border container. */
  containerClass?: string
}>(), {
  manualSorting: false,
  rowClickable: false,
  emptyText: 'No data.',
  containerClass: 'rounded-lg border overflow-auto',
})

const emit = defineEmits<{
  (e: 'update:sorting', value: SortingState): void
  (e: 'row-click', row: T): void
}>()

const internalSorting = ref<SortingState>([])
const sortingState = computed<SortingState>({
  get: () => props.sorting ?? internalSorting.value,
  set: (v) => {
    internalSorting.value = v
    emit('update:sorting', v)
  },
})

const table = useVueTable({
  get data() { return props.data },
  get columns() { return props.columns },
  getCoreRowModel: getCoreRowModel(),
  getSortedRowModel: getSortedRowModel(),
  get manualSorting() { return props.manualSorting },
  getRowId: props.getRowId,
  state: {
    get sorting() { return sortingState.value },
  },
  onSortingChange: (updater) => {
    sortingState.value = typeof updater === 'function' ? updater(sortingState.value) : updater
  },
})

// Expose the table instance for pages that need richer access.
defineExpose({ table })

function metaOf(col: { columnDef: { meta?: unknown } }): ColMeta {
  return (col.columnDef.meta ?? {}) as ColMeta
}
function alignClass(align?: ColMeta['align']): string {
  return align === 'center' ? 'text-center' : align === 'right' ? 'text-right' : ''
}

const hasActions = computed(() => !!useSlots().actions)
</script>

<template>
  <div :class="containerClass">
    <Table>
      <TableHeader>
        <TableRow v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id">
          <TableHead
            v-for="header in headerGroup.headers"
            :key="header.id"
            :class="[
              alignClass(metaOf(header.column).align),
              metaOf(header.column).headClass,
              header.column.getCanSort() ? 'cursor-pointer select-none' : '',
            ]"
            @click="header.column.getCanSort() ? header.column.getToggleSortingHandler()?.($event) : undefined"
          >
            <div
              class="flex items-center gap-1.5"
              :class="metaOf(header.column).align === 'center' ? 'justify-center' : metaOf(header.column).align === 'right' ? 'justify-end' : ''"
            >
              <FlexRender
                v-if="!header.isPlaceholder"
                :render="header.column.columnDef.header"
                :props="header.getContext()"
              />
              <Icon
                v-if="header.column.getCanSort()"
                :name="
                  header.column.getIsSorted() === 'asc' ? 'lucide:arrow-up'
                  : header.column.getIsSorted() === 'desc' ? 'lucide:arrow-down'
                    : 'lucide:chevrons-up-down'
                "
                class="size-3 text-muted-foreground/60 shrink-0"
              />
            </div>
          </TableHead>
          <TableHead v-if="hasActions" class="w-20" />
        </TableRow>
      </TableHeader>
      <TableBody>
        <template v-if="table.getRowModel().rows.length">
          <TableRow
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            :class="[rowClickable ? 'cursor-pointer hover:bg-muted/50' : '', rowClass?.(row.original)]"
            @click="rowClickable ? emit('row-click', row.original) : undefined"
          >
            <TableCell
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              :class="[alignClass(metaOf(cell.column).align), metaOf(cell.column).cellClass]"
            >
              <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
            </TableCell>
            <TableCell v-if="hasActions" class="text-right" @click.stop>
              <slot name="actions" :row="row.original" />
            </TableCell>
          </TableRow>
        </template>
        <template v-else>
          <TableRow>
            <TableCell :colspan="columns.length + (hasActions ? 1 : 0)" class="text-center py-12 text-muted-foreground">
              <slot name="empty">{{ emptyText }}</slot>
            </TableCell>
          </TableRow>
        </template>
      </TableBody>
    </Table>
  </div>
</template>
