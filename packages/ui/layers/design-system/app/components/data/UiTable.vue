<script setup lang="ts" generic="T extends object">
import type { RowData } from '@tanstack/table-core'
import type {
  ColumnDef,
  ColumnFiltersState,
  ExpandedState,
  Row,
  SortingFn,
  SortingState,
  VisibilityState,
} from '@tanstack/vue-table'
import {
  FlexRender,
  functionalUpdate,
  getCoreRowModel,
  getExpandedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useVueTable,
} from '@tanstack/vue-table'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { useIntersectionObserver } from '@vueuse/core'

const {
  data,
  columns,
  selected,
  controlledSelection = false,
  rowHover = false,
  rowClickable = false,
  enableSorting = false,
  manualSorting = false,
  pageSize = 10,
  sortingFns,
  ignoreHeader,
  size = 'md',
  loading = false,
  loadingRows = 5,
  rowId,
  manualPagination = false,
  disablePagination = false,
  total,
  rowClass,
} = defineProps<UiTableProps<T>>()

const emit = defineEmits<{
  'rowSelectionChange': [value: Record<string, boolean>]
  'rowClick': [row: T]
  'update:page': [page: number]
  'sortColumn': [column: string]
}>()

const selectedModel = defineModel<Record<string, boolean>>('selected')
const pageModel = defineModel<number>('page', { default: 1 })
const sortingModel = defineModel<SortingState>('sorting', { default: () => [] })

const columnFilters = ref<ColumnFiltersState>([])
const columnVisibility = ref<VisibilityState>({})
const rowSelection = ref(selected || {})
const expanded = ref<ExpandedState>({})
const pagination = ref({ pageIndex: 0, pageSize })

watch(rowSelection, () => {
  emit('rowSelectionChange', rowSelection.value)
})

function getSortDirection(columnId: string): 'asc' | 'desc' | false {
  const entry = sortingModel.value.find(s => s.id === columnId)
  if (!entry)
    return false
  return entry.desc ? 'desc' : 'asc'
}

function getAriaSort(columnId: string): 'ascending' | 'descending' | 'none' {
  const dir = getSortDirection(columnId)
  if (dir === 'asc')
    return 'ascending'
  if (dir === 'desc')
    return 'descending'
  return 'none'
}

function toggleSort(columnId: string) {
  if (manualSorting) {
    emit('sortColumn', columnId)
    return
  }
  const current = sortingModel.value.find(s => s.id === columnId)
  if (!current)
    sortingModel.value = [{ id: columnId, desc: false }]
  else if (!current.desc)
    sortingModel.value = [{ id: columnId, desc: true }]
  else
    sortingModel.value = []
}

function getTextAlignClass(align?: 'left' | 'center' | 'right'): string {
  if (align === 'center')
    return 'text-center'
  if (align === 'right')
    return 'text-right'
  return 'text-left'
}

function resolveRowId(row: T): string {
  const rowRecord = row as Record<string, unknown>
  if (!rowId) {
    const id = rowRecord.id
    return typeof id === 'string' ? id : String(id ?? '')
  }
  if (typeof rowId === 'function')
    return rowId(row)
  const id = rowRecord[rowId]
  return typeof id === 'string' ? id : String(id ?? '')
}

function handleRowClick(row: T, tanstackRow: Row<T>) {
  if (!rowClickable)
    return
  emit('rowClick', row)
  if (slots['expanded-component']) {
    if (tanstackRow.getIsExpanded())
      expanded.value = {}
    else
      expanded.value = { [tanstackRow.id]: true }
  }
}

function onRowKeydown(e: KeyboardEvent, row: T, tanstackRow: Row<T>) {
  if (e.target !== e.currentTarget)
    return
  if (e.key === 'Enter') {
    e.preventDefault()
    handleRowClick(row, tanstackRow)
  }
  else if (e.key === ' ') {
    // Prevent Space from scrolling; activate on keyup to match native buttons.
    e.preventDefault()
  }
}

function onRowKeyup(e: KeyboardEvent, row: T, tanstackRow: Row<T>) {
  if (e.target !== e.currentTarget)
    return
  if (e.key === ' ') {
    e.preventDefault()
    handleRowClick(row, tanstackRow)
  }
}

function onRowClick(e: MouseEvent, row: T, tanstackRow: Row<T>) {
  const target = e.target
  const currentTarget = e.currentTarget
  if (target instanceof Element && target !== currentTarget) {
    const interactive = target.closest('a, button, input, select, textarea, summary, [role="button"], [role="link"], [contenteditable="true"]')
    if (interactive)
      return
  }
  handleRowClick(row, tanstackRow)
}

const slots = useSlots()

// Optional trailing actions column (row buttons/menus). Rendered outside the
// TanStack column model so callers express rich actions as a slot, not a cell
// render fn. `colSpan` accounts for it in the empty/skeleton rows.
const hasActions = computed(() => !!slots.actions)
const colSpan = computed(() => columns.length + (hasActions.value ? 1 : 0))

const table = useVueTable<T>({
  data: toRef(() => data),
  columns: columns as ColumnDef<T, unknown>[],
  getCoreRowModel: getCoreRowModel(),
  enableSorting,
  manualSorting,
  ...(!manualPagination && { getPaginationRowModel: getPaginationRowModel() }),
  ...(!manualSorting && { getSortedRowModel: getSortedRowModel() }),
  getFilteredRowModel: getFilteredRowModel(),
  getExpandedRowModel: getExpandedRowModel(),
  manualPagination,
  ...(manualPagination && total != null && { rowCount: total }),
  onPaginationChange: u => pagination.value = functionalUpdate(u, pagination.value),
  onSortingChange: u => sortingModel.value = functionalUpdate(u, sortingModel.value),
  onColumnFiltersChange: u => columnFilters.value = functionalUpdate(u, columnFilters.value),
  onColumnVisibilityChange: u => columnVisibility.value = functionalUpdate(u, columnVisibility.value),
  getRowId: resolveRowId,
  onRowSelectionChange(u) {
    const target = controlledSelection ? selectedModel : rowSelection
    target.value = functionalUpdate(u, target.value ?? {})
  },
  onExpandedChange: u => expanded.value = functionalUpdate(u, expanded.value),
  state: {
    get pagination() { return pagination.value },
    get sorting() { return sortingModel.value },
    get columnFilters() { return columnFilters.value },
    get columnVisibility() { return columnVisibility.value },
    get rowSelection() { return controlledSelection ? selectedModel.value : rowSelection.value },
    get expanded() { return expanded.value },
  },
  sortingFns,
})

// Exposed so callers can reach the TanStack instance (e.g. a column-visibility
// menu via `getAllLeafColumns()`).
defineExpose({ table })

// Sticky-header shadow: a zero-height sentinel sits at the top of the wrapper;
// once it scrolls out through the top the sticky thead has reached the edge, so
// we lift it. IntersectionObserver fires only on crossing — no per-scroll
// `getBoundingClientRect()` reflow (the old window-scroll listener ran a
// querySelector + layout read on every tick, for every mounted table).
const sentinelEl = useTemplateRef<HTMLElement>('sentinelEl')
const isScrolled = ref(false)

useIntersectionObserver(sentinelEl, ([entry]) => {
  if (entry)
    isScrolled.value = !entry.isIntersecting
})

// Dev guard: pagination (default + manual) bounds the rendered rows, but
// `disablePagination` mounts every row. Warn before that becomes a perf problem
// so the caller paginates or caps the list rather than virtualizing blindly.
if (import.meta.dev) {
  const ROW_WARN_THRESHOLD = 150
  let warned = false
  watch(() => disablePagination && data.length, () => {
    if (disablePagination && data.length > ROW_WARN_THRESHOLD && !warned) {
      warned = true
      logOperationalWarn('ui.table_unpaginated_large_render', null, {
        rows: data.length,
        threshold: ROW_WARN_THRESHOLD,
      }, console)
    }
  }, { immediate: true })
}
</script>

<script lang="ts">
declare module '@tanstack/table-core' {
  // Type parameters must match TanStack's `ColumnDefBase` declaration exactly
  // (name, constraint, and default) — interface declaration merging requires
  // identical type parameters (TS2428).
  interface ColumnDefBase<TData extends RowData, TValue = unknown> {
    align?: 'left' | 'center' | 'right'
    noPadding?: boolean
    stableData?: boolean
    tooltip?: string
    /** Extra classes for this column's header cell (e.g. width constraints). */
    headClass?: string
    /** Extra classes for this column's body cells. */
    cellClass?: string
    ui?: { td?: { base?: string } }
    /**
     * @internal Phantom member — exists only to bind the `TData`/`TValue` type
     * parameters that declaration merging forces us to declare. Never assigned.
     */
    readonly __uiTablePhantom?: (data: TData, value: TValue) => void
  }
}

export interface UiTableColumnProps<_T> {
  align?: 'left' | 'center' | 'right'
  noPadding?: boolean
  accessorKey?: string
  stableData?: boolean
  tooltip?: string
  headClass?: string
  cellClass?: string
  ui?: { td?: { base?: string } }
}

const sizes = {
  xs: { td: 'py-1 h-8', skeleton: 'h-4' },
  sm: { td: 'py-1 h-10', skeleton: 'h-4' },
  md: { td: 'py-2 h-10', skeleton: 'h-6' },
} as const

export interface UiTableProps<T> {
  data: T[]
  columns: (Omit<ColumnDef<T, unknown>, 'accessorKey'> & UiTableColumnProps<T>)[]
  selected?: Record<string, boolean>
  controlledSelection?: boolean
  rowHover?: boolean
  rowClickable?: boolean
  enableSorting?: boolean
  /** Caller owns sort state; UiTable emits @sortColumn and does not run getSortedRowModel. */
  manualSorting?: boolean
  pageSize?: number
  sortingFns?: Record<string, SortingFn<T>>
  ignoreHeader?: boolean
  size?: keyof typeof sizes
  loading?: boolean
  loadingRows?: number
  rowId?: string | ((row: T) => string)
  manualPagination?: boolean
  disablePagination?: boolean
  total?: number
  /** Accessible name for the table. Rendered as a visually-hidden <caption>. */
  label?: string
  /** Extra classes applied per data row — e.g. a selection highlight. */
  rowClass?: (row: T) => string
}
</script>

<template>
  <div data-ui="UiTable" class="w-full overflow-x-auto overscroll-x-contain lg:overflow-x-visible" :data-scrolled="isScrolled || undefined">
    <div ref="sentinelEl" aria-hidden="true" class="h-px w-full" />
    <table class="w-full" :aria-busy="loading || undefined">
      <caption v-if="label" class="sr-only">
        {{ label }}
      </caption>
      <thead v-if="!ignoreHeader" class="sticky top-0 z-10 bg-default">
        <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id" class="h-10">
          <th
            v-for="header in headerGroup.headers"
            :key="header.id"
            class="text-label text-muted text-left whitespace-nowrap border-b border-default bg-default"
            :class="[
              header.column.columnDef.noPadding ? '' : header.column.getCanSort() ? 'px-2' : 'px-3',
              header.column.columnDef.headClass,
            ]"
            :aria-sort="header.column.getCanSort() ? getAriaSort(header.column.id) : undefined"
            scope="col"
          >
            <UiTableHeaderCell
              :header="header"
              :sort-direction="getSortDirection(header.column.id)"
              @sort="toggleSort"
            />
          </th>
          <th v-if="hasActions" class="w-px border-b border-default bg-default" scope="col">
            <span class="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody :class="{ 'hover-rows': rowHover || rowClickable }">
        <template v-if="table.getRowModel().rows?.length">
          <tr class="spacer" />
          <template v-for="row in table.getRowModel().rows" :key="row.id">
            <tr
              :data-state="row.getIsSelected() && 'selected'"
              :data-expanded="row.getIsExpanded()"
              :data-row-id="row.id"
              :tabindex="rowClickable ? 0 : undefined"
              :aria-expanded="rowClickable && slots['expanded-component'] ? row.getIsExpanded() : undefined"
              :aria-selected="row.getIsSelected() ? true : undefined"
              class="border-b border-default"
              :class="[
                rowClickable && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
                rowClass?.(row.original),
              ]"
              @click="onRowClick($event, row.original, row)"
              @keydown="rowClickable && onRowKeydown($event, row.original, row)"
              @keyup="rowClickable && onRowKeyup($event, row.original, row)"
            >
              <td
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                class="text-xs font-normal text-default relative"
                :class="[
                  sizes[size].td,
                  cell.column.columnDef.noPadding ? '' : cell.column.getCanSort() ? 'px-2' : 'px-3',
                  getTextAlignClass(cell.column.columnDef.align),
                  cell.column.columnDef.cellClass,
                  cell.column.columnDef.ui?.td?.base || '',
                ]"
              >
                <UiSkeleton
                  v-if="loading && !cell.column.columnDef.stableData"
                  :class="[sizes[size].skeleton]"
                  :index="row.index * columns.length + cell.column.getIndex()"
                  :base="60"
                  :range="50"
                />
                <FlexRender v-else :render="cell.column.columnDef.cell" :props="cell.getContext()" />
              </td>
              <td v-if="hasActions" class="text-right whitespace-nowrap px-3" :class="sizes[size].td" @click.stop>
                <slot name="actions" :row="row.original" />
              </td>
            </tr>
            <tr v-if="row.getIsExpanded()" class="expanded-row">
              <td :colspan="colSpan" class="px-2 pb-2">
                <div class="rounded-lg bg-accented">
                  <slot name="expanded-component" :row="row.original" />
                </div>
              </td>
            </tr>
          </template>
        </template>

        <template v-else-if="loading">
          <tr class="spacer" />
          <tr v-for="i in loadingRows" :key="`skeleton-${i}`">
            <td
              v-for="(col, j) in columns"
              :key="j"
              class="text-xs px-3"
              :class="[sizes[size].td]"
            >
              <UiSkeleton class="h-4" :index="i * columns.length + j" :base="60" :range="50" />
            </td>
          </tr>
        </template>

        <tr v-else>
          <td :colspan="colSpan" class="h-24 text-center" role="status">
            <slot name="empty-component">
              <span class="text-xs font-mono text-dimmed">0 rows · adjust filters</span>
            </slot>
          </td>
        </tr>
      </tbody>
      <slot name="tfoot" />
    </table>

    <UPagination
      v-if="!disablePagination && manualPagination && total != null && total > pageSize"
      class="mt-5"
      :page="pageModel"
      :items-per-page="pageSize"
      :total="total"
      @update:page="(e: number) => { pageModel = e; emit('update:page', e) }"
    />
    <UPagination
      v-else-if="!disablePagination && !manualPagination && data.length > pageSize"
      class="mt-5"
      :page="table.getState().pagination.pageIndex + 1"
      :items-per-page="pageSize"
      :total="data.length"
      @update:page="e => table.setPageIndex(e - 1)"
    />
  </div>
</template>

<style scoped>
tr.spacer { height: 0.25rem; }
tbody tr:first-child td {
  border-top: 4px solid transparent;
  background-clip: padding-box;
}

/* Row hover: subtle bg wash. Use `bg-muted` (semantic), not a color-mix that
   collapses to invisible in light mode where bg-default and bg-accented are
   both near-white. */
tbody.hover-rows tr td {
  transition: background-color 140ms ease-out;
}
tbody.hover-rows tr:hover td,
tbody.hover-rows tr:focus-visible td {
  background-color: var(--ui-bg-muted);
}
tbody.hover-rows tr:hover td:first-child {
  border-top-left-radius: 0.5rem;
  border-bottom-left-radius: 0.5rem;
}
tbody.hover-rows tr:hover td:last-child {
  border-top-right-radius: 0.5rem;
  border-bottom-right-radius: 0.5rem;
}

/* The first-row spacer uses `border-top: 4px transparent` + `background-clip:
   padding-box` — that clips the hover bg in the padding gap. Reset so the
   wash fills the full row. */
tbody.hover-rows tr:hover:first-child td,
tbody.hover-rows tr:focus-visible:first-child td {
  background-clip: border-box;
}

/* Sticky-header lift when scrolled — overlay-tier depth. The bevel's dark
   bottom edge doubles as the header/body separator. */
[data-ui="UiTable"][data-scrolled] thead {
  box-shadow: var(--elevation-overlay);
}
[data-ui="UiTable"] thead {
  transition: box-shadow 200ms ease-out;
}
</style>
