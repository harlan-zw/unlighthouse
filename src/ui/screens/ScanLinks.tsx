import type { BrokenLink } from '../../contracts.ts'
import type { Scan } from '../../types.ts'
import { useQuery } from '../hooks.ts'
import { pathOf } from '../format.ts'
import { Badge, EmptyState, ErrorState } from '../components/controls.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'

function statusText(status: number): string {
  if (status === 404)
    return 'Not found'
  if (status === 410)
    return 'Gone'
  if (status >= 500)
    return 'Server error'
  if (status === 0)
    return 'Unreachable'
  return 'Error'
}

export function ScanLinks({ scan, refresh }: { scan: Scan, refresh: number }) {
  const links = useQuery('scans.brokenLinks', { scanId: scan.id }, refresh)
  const columns: Column<BrokenLink>[] = [
    {
      key: 'status',
      header: 'Status',
      sortValue: link => link.status,
      render: link => <Badge tone={link.status >= 500 || link.status === 0 ? 'poor' : 'average'} title={statusText(link.status)}>{link.status === 0 ? 'ERR' : String(link.status)}</Badge>,
    },
    {
      key: 'url',
      header: 'Broken URL',
      className: 'cell-url',
      sortValue: link => link.url,
      render: link => <a className="url-path link" href={link.url} target="_blank" rel="noreferrer" title={link.url}>{pathOf(link.url)}</a>,
    },
    {
      key: 'from',
      header: 'Linked from',
      className: 'cell-url',
      sortValue: link => link.from,
      render: link => <a className="url-path" href={link.from} target="_blank" rel="noreferrer" title={link.from}>{pathOf(link.from)}</a>,
    },
    { key: 'reason', header: 'Reason', hideBelow: 'sm', render: link => <span className="muted">{statusText(link.status)}</span> },
  ]
  if (links.error)
    return <ErrorState error={links.error} onRetry={links.reload} />
  return (
    <DataTable
      caption="Broken links"
      columns={columns}
      rows={links.data}
      rowKey={link => `${link.url}|${link.from}`}
      loading={links.loading}
      defaultSort={{ key: 'status', order: 'asc' }}
      empty={<EmptyState title="No broken links" compact>Every same-origin link the crawler followed returned a successful response.</EmptyState>}
    />
  )
}
