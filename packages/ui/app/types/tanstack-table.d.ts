import type { RowData } from '@tanstack/vue-table'

// Augment TanStack's per-column `meta` with the fields our shared
// DataTable reads for alignment and class overrides.
declare module '@tanstack/vue-table' {
  interface ColumnMeta<TData extends RowData, TValue> {
    align?: 'center' | 'right'
    headClass?: string
    cellClass?: string
  }
}
