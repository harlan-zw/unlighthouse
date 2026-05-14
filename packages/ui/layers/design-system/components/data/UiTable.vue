<script setup lang="ts" generic="T extends Record<string, any>">
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
  if (!rowId)
    return row.id
  if (typeof rowId === 'function')
    return rowId(row)
  return row[rowId]
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
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    handleRowClick(row, tanstackRow)
  }
}

const slots = useSlots()

const table = useVueTable<T>({
  data: toRef(() => data),
  columns: columns as ColumnDef<T, any>[],
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

// Sticky-header shadow: toggles `data-scrolled` on the wrapper when the
// thead has crossed the top of the viewport (or its scrollable ancestor).
const wrapperEl = useTemplateRef<HTMLElement>('wrapperEl')
const isScrolled = ref(false)

function onScroll() {
  const headEl = wrapperEl.value?.querySelector('thead')
  if (!headEl)
    return
  isScrolled.value = headEl.getBoundingClientRect().top <= 0.5
}

onMounted(() => {
  window.addEventListener('scroll', onScroll, { passive: true, capture: true })
  onScroll()
})
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll, { capture: true })
})
</script>

<script lang="ts">
declare module '@tanstack/table-core' {

  // eslint-disable-next-line unused-imports/no-unused-vars -- declaration merging must preserve TanStack's type parameter names.
  interface ColumnDefBase<TData extends RowData, TValue = unknown> {
    align?: 'left' | 'center' | 'right'
    noPadding?: boolean
    stableData?: boolean
    tooltip?: string
    ui?: { td?: { base?: string } }
  }
}

export interface UiTableColumnProps<_T> {
  align?: 'left' | 'center' | 'right'
  noPadding?: boolean
  accessorKey?: string
  stableData?: boolean
  tooltip?: string
  ui?: { td?: { base?: string } }
}

const sizes = {
  xs: { td: 'py-1 h-8', skeleton: 'h-4' },
  sm: { td: 'py-1 h-10', skeleton: 'h-4' },
  md: { td: 'py-2 h-10', skeleton: 'h-6' },
} as const

export interface UiTableProps<T> {
  data: T[]
  columns: (Omit<ColumnDef<T, any>, 'accessorKey'> & UiTableColumnProps<T>)[]
  selected?: Record<string, boolean>
  controlledSelection?: boolean
  rowHover?: boolean
  rowClickable?: boolean
  enableSorting?: boolean
  /** Caller owns sort state; UiTable emits @sortColumn and does not run getSortedRowModel. */
  manualSorting?: boolean
  pageSize?: number
  sortingFns?: Record<string, SortingFn<any>>
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
}
</script>

<template>
  <div ref="wrapperEl" data-ui="UiTable" class="w-full" :data-scrolled="isScrolled || undefined">
    <table class="w-full" :aria-busy="loading || undefined">
      <caption v-if="label" class="sr-only">
        {{ label }}
      </caption>
      <thead v-if="!ignoreHeader" class="sticky top-0 z-10 bg-default">
        <tr v-for="headerGroup in table.getHeaderGroups()" :key="headerGroup.id" class="h-10">
          <th
            v-for="header in headerGroup.headers"
            :key="header.id"
            class="text-[11px] font-semibold text-dimmed uppercase tracking-[0.08em] text-left whitespace-nowrap border-b border-default bg-default"
            :class="header.column.columnDef.noPadding ? '' : header.column.getCanSort() ? 'px-2' : 'px-3'"
            :aria-sort="header.column.getCanSort() ? getAriaSort(header.column.id) : undefined"
            scope="col"
          >
            <UiTableHeaderCell
              :header="header"
              :sort-direction="getSortDirection(header.column.id)"
              @sort="toggleSort"
            />
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
              :role="rowClickable ? 'button' : undefined"
              :aria-expanded="rowClickable && slots['expanded-component'] ? row.getIsExpanded() : undefined"
              :aria-selected="row.getIsSelected() ? true : undefined"
              class="border-b border-default"
              :class="[
                rowClickable && 'cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              ]"
              @click="handleRowClick(row.original, row)"
              @keydown="rowClickable && onRowKeydown($event, row.original, row)"
            >
              <td
                v-for="cell in row.getVisibleCells()"
                :key="cell.id"
                class="text-xs font-normal text-default relative"
                :class="[
                  sizes[size].td,
                  cell.column.columnDef.noPadding ? '' : cell.column.getCanSort() ? 'px-2' : 'px-3',
                  getTextAlignClass(cell.column.columnDef.align),
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
            </tr>
            <tr v-if="row.getIsExpanded()" class="expanded-row">
              <td :colspan="row.getAllCells().length" class="px-2 pb-2">
                <div class="rounded-sm bg-accented">
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
          <td :colspan="columns.length" class="h-24 text-center" role="status">
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

/* Sticky-header shadow when scrolled. Inset highlights dropped (header
   isn't a card surface), keep the 3-layer atmospheric shadow. */
[data-ui="UiTable"][data-scrolled] thead {
  box-shadow:
    0 1px 1px 0 rgb(0 0 0 / 0.05),
    0 4px 12px -2px rgb(0 0 0 / 0.08),
    0 16px 32px -8px rgb(0 0 0 / 0.12);
}
[data-ui="UiTable"] thead {
  transition: box-shadow 200ms ease-out;
}
</style>
