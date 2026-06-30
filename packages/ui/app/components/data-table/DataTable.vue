<script setup lang="ts" generic="T">
// Reusable TanStack-powered table. Pages own their column defs, data,
// toolbar and pagination; this component owns the repetitive bits that
// every table shared before it existed: the header/body FlexRender loops,
// sort-toggle headers, alignment, the empty row, and rowClick wiring.
//
// Column alignment / per-cell classes ride on TanStack's `meta`:
//   { meta: { align: 'center' | 'right', headClass, cellClass } }
//
// Sorting is v-model-able. Pass `manual-sorting` for server-side sort
// (the table won't reorder rows itself; it just reflects/emits state).
//
// Rendered with plain HTML table elements styled off the design-system
// --ui-* tokens (no shadcn primitives) — header is the .text-label chrome
// label, rows separated by border-default hairlines.
import type { ColumnDef, SortingState } from '@tanstack/vue-table'
import { FlexRender, getCoreRowModel, getSortedRowModel, useVueTable } from '@tanstack/vue-table'

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
  /** Apply hover/cursor affordance and emit `rowClick`. */
  rowClickable?: boolean
  rowClass?: (row: T) => string
  emptyText?: string
  /** Classes for the scroll/border container. */
  containerClass?: string
  /** Row density — 'compact' tightens vertical padding. */
  density?: 'comfortable' | 'compact'
  /** Pin the header while scrolling. Works for both a max-height scroll
   *  container and whole-page scroll (use `stickyOffset` to clear a fixed bar). */
  stickyHeader?: boolean
  /** Tailwind top-* class for where the sticky header pins. Defaults to `top-0`
   *  (scroll-container case); pass e.g. `top-12` to sit below a sticky app bar
   *  when the page itself scrolls. */
  stickyOffset?: string
}>(), {
  manualSorting: false,
  rowClickable: false,
  emptyText: 'No data.',
  containerClass: 'rounded-lg border border-default overflow-auto',
  density: 'comfortable',
  stickyOffset: 'top-0',
})

const emit = defineEmits<{
  (e: 'update:sorting', value: SortingState): void
  (e: 'rowClick', row: T): void
}>()
const densityCellClass = computed(() => (props.density === 'compact' ? 'py-1' : ''))
const stickyHeadClass = computed(() => (props.stickyHeader ? `sticky ${props.stickyOffset} z-10 bg-default` : ''))

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
    <table class="w-full">
      <thead>
        <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id" class="border-b border-default">
          <th
            v-for="header in headerGroup.headers"
            :key="header.id"
            class="text-label text-dimmed whitespace-nowrap px-3 h-10 text-left bg-default"
            :class="[
              alignClass(metaOf(header.column).align),
              metaOf(header.column).headClass,
              stickyHeadClass,
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
              <UiIcon
                v-if="header.column.getCanSort()"
                :name="
                  header.column.getIsSorted() === 'asc' ? 'up'
                  : header.column.getIsSorted() === 'desc' ? 'down'
                    : 'sort'
                "
                class="size-3 text-muted/60 shrink-0"
              />
            </div>
          </th>
          <th v-if="hasActions" class="w-20" />
        </tr>
      </thead>
      <tbody>
        <template v-if="table.getRowModel().rows.length">
          <tr
            v-for="row in table.getRowModel().rows"
            :key="row.id"
            class="border-b border-default last:border-0"
            :class="[rowClickable ? 'cursor-pointer hover:bg-elevated/50' : '', rowClass?.(row.original)]"
            @click="rowClickable ? emit('rowClick', row.original) : undefined"
          >
            <td
              v-for="cell in row.getVisibleCells()"
              :key="cell.id"
              class="px-3 py-2 text-xs text-default"
              :class="[alignClass(metaOf(cell.column).align), metaOf(cell.column).cellClass, densityCellClass]"
            >
              <FlexRender :render="cell.column.columnDef.cell" :props="cell.getContext()" />
            </td>
            <td v-if="hasActions" class="text-right px-3 py-2" @click.stop>
              <slot name="actions" :row="row.original" />
            </td>
          </tr>
        </template>
        <template v-else>
          <tr>
            <td :colspan="columns.length + (hasActions ? 1 : 0)" class="text-center py-12 text-muted">
              <slot name="empty">
                {{ emptyText }}
              </slot>
            </td>
          </tr>
        </template>
      </tbody>
    </table>
  </div>
</template>
