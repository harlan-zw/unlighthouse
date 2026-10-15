import { useState } from 'react'
import type { Scan } from '../../types.ts'
import { useClient, useDocumentTitle, useQuery } from '../hooks.ts'
import { formatCount, formatDate, formatDuration, formatRelative, hostOf } from '../format.ts'
import { href, Link, navigate, routeHref } from '../router.tsx'
import { DeviceLabel, EmptyState, ErrorState, Skeleton, StatusBadge } from '../components/controls.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'
import { Card, PageHead, useBreadcrumbs } from '../components/layout.tsx'
import { StartScanForm } from './Sites.tsx'

const LIMIT = 25

export function scanName(scan: Pick<Scan, 'id' | 'label'>): string {
  return scan.label ?? `Scan ${scan.id}`
}

export function SitePage({ siteId }: { siteId: number }) {
  const client = useClient()
  const sites = useQuery('sites.list', {})
  const site = sites.data?.find(s => s.id === siteId)
  const [offset, setOffset] = useState(0)
  const scans = useQuery('scans.list', site ? { origin: site.origin, limit: LIMIT, offset } : null)
  const [showForm, setShowForm] = useState(false)
  const host = site ? hostOf(site.origin) : `Site ${siteId}`
  useBreadcrumbs([{ label: 'Sites', href: href('/') }, { label: host }])
  useDocumentTitle(host)

  if (sites.error)
    return <ErrorState error={sites.error} onRetry={sites.reload} />
  if (!sites.data)
    return <Skeleton lines={6} />
  if (!site)
    return <EmptyState title="Site not found" action={<Link className="btn" to={href('/')}>All sites</Link>}>{`No site with id ${siteId}.`}</EmptyState>

  const items = scans.data?.items
  const previousDone = (scan: Scan) => items?.find(s => s.createdAt < scan.createdAt && s.status === 'done')

  const columns: Column<Scan>[] = [
    {
      key: 'scan',
      header: 'Scan',
      render: scan => (
        <span className="url-cell">
          <Link to={routeHref({ name: 'scan', scanId: scan.id, tab: 'overview' })} className="truncate" style={{ fontWeight: 500 }}>{scanName(scan)}</Link>
          <span className="cell-sub">{formatDate(scan.createdAt)}</span>
        </span>
      ),
      sortValue: scan => scan.createdAt,
      defaultOrder: 'desc',
    },
    { key: 'status', header: 'Status', render: scan => <StatusBadge status={scan.status} />, sortValue: scan => scan.status },
    {
      key: 'git',
      header: 'Branch',
      hideBelow: 'sm',
      render: scan => scan.branch ? <span className="chip" title={scan.commit ?? undefined}>{scan.commit ? `${scan.branch} @ ${scan.commit.slice(0, 7)}` : scan.branch}</span> : <span className="faint">—</span>,
      sortValue: scan => scan.branch,
    },
    { key: 'devices', header: 'Devices', hideBelow: 'md', render: scan => <span className="row">{scan.devices.map(d => <DeviceLabel key={d} device={d} />)}</span> },
    { key: 'pages', header: 'Audits', align: 'right', render: scan => <span className="num">{`${formatCount(scan.stats.done)} / ${formatCount(scan.stats.done + scan.stats.failed + scan.stats.queued)}`}</span>, sortValue: scan => scan.stats.done },
    { key: 'found', header: 'Discovered', align: 'right', hideBelow: 'sm', render: scan => <span className="num">{formatCount(scan.stats.discovered)}</span>, sortValue: scan => scan.stats.discovered },
    { key: 'duration', header: 'Duration', align: 'right', hideBelow: 'md', render: scan => <span className="num">{scan.startedAt ? formatDuration((scan.finishedAt ?? Date.now()) - scan.startedAt) : '—'}</span> },
    {
      key: 'actions',
      header: <span className="sr-only">Actions</span>,
      align: 'right',
      render: (scan) => {
        const prev = previousDone(scan)
        return scan.status === 'done' && prev
          ? <Link className="btn btn-sm btn-ghost" to={routeHref({ name: 'compare', siteId, base: prev.id, head: scan.id })}>Compare</Link>
          : null
      },
    },
  ]

  return (
    <div className="stack">
      <PageHead
        eyebrow="Site"
        title={host}
        meta={(
          <>
            <a className="link" href={site.origin} target="_blank" rel="noreferrer">{site.origin}</a>
            <span>{`${site.scans} ${site.scans === 1 ? 'scan' : 'scans'}`}</span>
            <span>{`Tracked since ${formatRelative(site.createdAt)}`}</span>
          </>
        )}
        actions={(
          <>
            <Link className="btn" to={routeHref({ name: 'compare', siteId, base: null, head: null })}>Compare scans</Link>
            {client.mode !== 'static' && <button type="button" className="btn btn-primary" onClick={() => setShowForm(v => !v)} aria-expanded={showForm}>New scan</button>}
          </>
        )}
      />
      {showForm && (
        <Card title="New scan">
          <StartScanForm initialUrl={site.origin} />
        </Card>
      )}
      {scans.error
        ? <ErrorState error={scans.error} onRetry={scans.reload} />
        : (
            <DataTable
              caption={`Scans of ${host}`}
              columns={columns}
              rows={items}
              rowKey={scan => scan.id}
              loading={scans.loading}
              defaultSort={{ key: 'scan', order: 'desc' }}
              onRowActivate={scan => navigate(routeHref({ name: 'scan', scanId: scan.id, tab: 'overview' }))}
              empty={<EmptyState title="No scans yet" compact />}
              pagination={{ offset, limit: LIMIT, total: scans.data?.total ?? 0, onChange: setOffset }}
            />
          )}
    </div>
  )
}
