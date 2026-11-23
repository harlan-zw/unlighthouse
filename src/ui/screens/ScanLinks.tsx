import type { BrokenLink } from '../../contracts.ts'
import type { Scan } from '../../types.ts'
import { useDocumentTitle, useQuery } from '../hooks.ts'
import { hostOf, pathOf, plural } from '../format.ts'
import { Badge, EmptyState, ErrorState, ScanPill, Skeleton } from '../components/controls.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'
import { Hero, TopBar } from '../components/layout.tsx'
import { routeHref } from '../router.tsx'
import { useScope } from '../scope.tsx'

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

function LinksTable({ scan, refresh }: { scan: Scan, refresh: number }) {
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
      empty={<EmptyState title="No broken links" compact />}
    />
  )
}

export function LinksPage() {
  const { scan, summary, refresh, error } = useScope()
  const host = scan ? hostOf(scan.origin) : '…'
  useDocumentTitle(host === '…' ? 'Links' : `Links · ${host}`)
  if (error && !scan)
    return <ErrorState error={error} />
  if (!scan)
    return <><TopBar crumbs={[{ label: host }, { label: 'Links' }]} /><div className="pad"><Skeleton lines={6} height={36} /></div></>
  return (
    <>
      <TopBar crumbs={[{ label: host, href: routeHref({ name: 'site', siteId: scan.siteId }) }, { label: 'Links' }]} status={<ScanPill status={scan.status} />} />
      <Hero title={summary ? plural(summary.brokenLinks, 'broken link') : 'Links'} />
      <div className="table-wrap">
        <LinksTable scan={scan} refresh={refresh} />
      </div>
    </>
  )
}
