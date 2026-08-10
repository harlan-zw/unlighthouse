import type { ColumnDef, RowData } from '@tanstack/vue-table'
import {
  columnFilteringFeature,
  columnVisibilityFeature,
  createExpandedRowModel,
  createFilteredRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  tableFeatures,
} from '@tanstack/vue-table'

export interface UiTableColumnMeta {
  align?: 'left' | 'center' | 'right'
  noPadding?: boolean
  stableData?: boolean
  tooltip?: string
  headClass?: string
  cellClass?: string
  ui?: { td?: { base?: string } }
}

export const uiTableFeatures = tableFeatures({
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
  columnVisibilityFeature,
  rowExpandingFeature,
  expandedRowModel: createExpandedRowModel(),
  rowPaginationFeature,
  paginatedRowModel: createPaginatedRowModel(),
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnMeta: {} as UiTableColumnMeta,
})

export type UiTableFeatures = typeof uiTableFeatures
export type UiTableColumn<T extends RowData> = ColumnDef<UiTableFeatures, T, unknown>
