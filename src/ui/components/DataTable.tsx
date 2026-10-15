import { Fragment, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { formatCount } from '../format.ts'
import { EmptyState, Spinner } from './controls.tsx'

export type SortOrder = 'asc' | 'desc'

export interface SortState {
  key: string
  order: SortOrder
}

export interface Column<T> {
  key: string
  header: ReactNode
  title?: string
  render: (row: T) => ReactNode
  sortValue?: (row: T) => string | number | null
  sortable?: boolean
  defaultOrder?: SortOrder
  align?: 'left' | 'right' | 'center'
  width?: string
  className?: string
  hideBelow?: 'sm' | 'md'
}

export interface Pagination {
  offset: number
  limit: number
  total: number
  onChange: (offset: number) => void
}

interface DataTableProps<T> {
  columns: Column<T>[]
  rows: T[] | undefined
  rowKey: (row: T) => string
  caption: string
  loading?: boolean
  empty?: ReactNode
  sort?: SortState | null
  onSortChange?: (sort: SortState) => void
  defaultSort?: SortState
  onRowActivate?: (row: T) => void
  rowHref?: (row: T) => string
  renderExpanded?: (row: T) => ReactNode
  expanded?: ReadonlySet<string>
  pagination?: Pagination
  maxHeight?: string
  dense?: boolean
}

function compare(a: string | number | null, b: string | number | null): number {
  if (a === b)
    return 0
  if (a === null)
    return 1
  if (b === null)
    return -1
  if (typeof a === 'number' && typeof b === 'number')
    return a - b
  return String(a).localeCompare(String(b), 'en', { numeric: true })
}

export function DataTable<T>(props: DataTableProps<T>) {
  const { columns, rows, rowKey, caption, loading, empty, onRowActivate, renderExpanded, expanded, pagination, maxHeight, dense } = props
  const [localSort, setLocalSort] = useState<SortState | null>(props.defaultSort ?? null)
  const controlled = props.onSortChange !== undefined
  const sort = controlled ? props.sort ?? null : localSort
  const bodyRef = useRef<HTMLTableSectionElement>(null)

  const sorted = useMemo(() => {
    if (!rows || controlled || !sort)
      return rows
    const column = columns.find(c => c.key === sort.key)
    if (!column?.sortValue)
      return rows
    const getter = column.sortValue
    const out = [...rows].sort((a, b) => {
      const va = getter(a)
      const vb = getter(b)
      if (va === null || vb === null)
        return compare(va, vb)
      return sort.order === 'asc' ? compare(va, vb) : compare(vb, va)
    })
    return out
  }, [rows, columns, sort, controlled])

  const toggleSort = (column: Column<T>) => {
    const next: SortState = sort?.key === column.key
      ? { key: column.key, order: sort.order === 'asc' ? 'desc' : 'asc' }
      : { key: column.key, order: column.defaultOrder ?? 'asc' }
    if (controlled)
      props.onSortChange?.(next)
    else
      setLocalSort(next)
  }

  const onRowKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, row: T) => {
    const current = event.currentTarget
    const all = Array.from(bodyRef.current?.querySelectorAll<HTMLTableRowElement>('tr[data-row]') ?? [])
    const index = all.indexOf(current)
    let target: HTMLTableRowElement | undefined
    if (event.key === 'ArrowDown' || event.key === 'j')
      target = all[index + 1]
    else if (event.key === 'ArrowUp' || event.key === 'k')
      target = all[index - 1]
    else if (event.key === 'Home')
      target = all[0]
    else if (event.key === 'End')
      target = all[all.length - 1]
    else if ((event.key === 'Enter' || event.key === ' ') && event.target === current && onRowActivate) {
      event.preventDefault()
      onRowActivate(row)
      return
    }
    if (target) {
      event.preventDefault()
      target.focus()
    }
  }

  const interactive = Boolean(onRowActivate)
  const showEmpty = !loading && sorted && sorted.length === 0
  const showLoading = loading && (!sorted || sorted.length === 0)
  const hideClass = (c: Column<T>) => c.hideBelow ? ` hide-${c.hideBelow}` : ''

  return (
    <div className={`table-card${dense ? ' dense' : ''}`}>
      <div className="table-scroll" style={maxHeight ? { maxHeight } : undefined} tabIndex={-1}>
        <table className="data-table" aria-busy={loading ? true : undefined} aria-rowcount={pagination ? pagination.total : undefined}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              {renderExpanded && <th scope="col" className="col-expander"><span className="sr-only">Expand</span></th>}
              {columns.map((column) => {
                const sortable = column.sortable ?? Boolean(column.sortValue)
                const active = sort?.key === column.key
                return (
                  <th
                    key={column.key}
                    scope="col"
                    className={`align-${column.align ?? 'left'}${column.className ? ` ${column.className}` : ''}${hideClass(column)}`}
                    style={column.width ? { width: column.width } : undefined}
                    aria-sort={active ? (sort.order === 'asc' ? 'ascending' : 'descending') : undefined}
                    title={column.title}
                  >
                    {sortable
                      ? (
                          <button type="button" className={`sort-button${active ? ' active' : ''}`} onClick={() => toggleSort(column)}>
                            {column.header}
                            <svg className="sort-icon" viewBox="0 0 8 12" width="7" height="10" aria-hidden="true">
                              <path className={active && sort.order === 'asc' ? 'on' : ''} d="M4 0 8 5H0Z" />
                              <path className={active && sort.order === 'desc' ? 'on' : ''} d="M4 12 0 7h8Z" />
                            </svg>
                          </button>
                        )
                      : column.header}
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {sorted?.map((row) => {
              const key = rowKey(row)
              const isExpanded = expanded?.has(key) ?? false
              const colSpan = columns.length + (renderExpanded ? 1 : 0)
              return (
                <Fragment key={key}>
                  <tr
                    data-row=""
                    tabIndex={0}
                    className={`${interactive ? 'interactive' : ''}${isExpanded ? ' expanded' : ''}`}
                    aria-expanded={renderExpanded ? isExpanded : undefined}
                    onClick={(event) => {
                      if (!onRowActivate)
                        return
                      if ((event.target as HTMLElement).closest('a, button, input, select, textarea'))
                        return
                      onRowActivate(row)
                    }}
                    onKeyDown={event => onRowKeyDown(event, row)}
                  >
                    {renderExpanded && (
                      <td className="col-expander">
                        <svg className="chevron" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.75">
                          <path d="m6 4 4 4-4 4" />
                        </svg>
                      </td>
                    )}
                    {columns.map(column => (
                      <td key={column.key} className={`align-${column.align ?? 'left'}${column.className ? ` ${column.className}` : ''}${hideClass(column)}`}>
                        {column.render(row)}
                      </td>
                    ))}
                  </tr>
                  {isExpanded && renderExpanded && (
                    <tr className="expansion">
                      <td colSpan={colSpan}>{renderExpanded(row)}</td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
        {showLoading && (
          <div className="table-state">
            <Spinner />
            <span>Loading…</span>
          </div>
        )}
        {showEmpty && <div className="table-state">{empty ?? <EmptyState title="Nothing here" compact />}</div>}
        {loading && sorted && sorted.length > 0 && <div className="table-refreshing" aria-hidden="true" />}
      </div>
      {pagination && pagination.total > 0 && <PaginationBar {...pagination} />}
    </div>
  )
}

export function PaginationBar({ offset, limit, total, onChange }: Pagination) {
  const page = Math.floor(offset / limit) + 1
  const pages = Math.max(1, Math.ceil(total / limit))
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(total, offset + limit)
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="pagination-range">
        <span className="num">{formatCount(from)}</span>
        –
        <span className="num">{formatCount(to)}</span>
        {' of '}
        <span className="num">{formatCount(total)}</span>
      </span>
      <span className="pagination-buttons">
        <button type="button" className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => onChange(0)} aria-label="First page">«</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={page <= 1} onClick={() => onChange(Math.max(0, offset - limit))}>Previous</button>
        <span className="pagination-page num">{`${page} / ${pages}`}</span>
        <button type="button" className="btn btn-sm btn-ghost" disabled={page >= pages} onClick={() => onChange(offset + limit)}>Next</button>
        <button type="button" className="btn btn-sm btn-ghost" disabled={page >= pages} onClick={() => onChange((pages - 1) * limit)} aria-label="Last page">»</button>
      </span>
    </nav>
  )
}
