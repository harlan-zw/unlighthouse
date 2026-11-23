import { useState } from 'react'
import type { Scan } from '../../types.ts'
import { EmptyState, ErrorState, ScanPill, Skeleton } from '../components/controls.tsx'
import { PaginationBar } from '../components/DataTable.tsx'
import { Hero, TopBar } from '../components/layout.tsx'
import { FigureCells, useScanFigures } from '../components/rows.tsx'
import { formatCount, hostOf, plural, shortCommit } from '../format.ts'
import { useClient, useDocumentTitle, useQuery } from '../hooks.ts'
import { useRestart } from '../restart.ts'
import { href, Link, routeHref } from '../router.tsx'

const LIMIT = 25

function ScanRow({ scan, number }: { scan: Scan, number: number }) {
  const figures = useScanFigures(scan)
  const git = scan.branch ? [scan.branch, shortCommit(scan.commit)].filter(Boolean).join(' · ') : null
  return (
    <Link role="listitem" className="site-row scan-row" to={routeHref({ name: 'scan', scanId: scan.id })}>
      <span className="stack-2 site-row-main-text">
        <span className="site-row-host truncate">
          {`#${number}`}
          {scan.label && <span className="muted">{` · ${scan.label}`}</span>}
        </span>
        <span className="faint small truncate">{[git, scan.devices.join(' + '), `${formatCount(figures.stats?.discovered ?? scan.stats.discovered)} pages`].filter(Boolean).join(' · ')}</span>
      </span>
      <span>{figures.status && <ScanPill status={figures.status} />}</span>
      <FigureCells figures={figures} scan={scan} />
    </Link>
  )
}

export function SitePage({ siteId }: { siteId: number }) {
  const client = useClient()
  const sites = useQuery('sites.list', {})
  const site = sites.data?.find(s => s.id === siteId)
  const [offset, setOffset] = useState(0)
  const scans = useQuery('scans.list', site ? { origin: site.origin, limit: LIMIT, offset } : null)
  const latest = scans.data?.items[0]
  const { restart, busy, error } = useRestart(offset === 0 ? latest : undefined)
  const host = site ? hostOf(site.origin) : `Site ${siteId}`
  useDocumentTitle(`Scans · ${host}`)
  const crumbs = [{ label: host }, { label: 'Scans' }]

  if (sites.error)
    return <ErrorState error={sites.error} onRetry={sites.reload} />
  if (!sites.data)
    return <><TopBar crumbs={crumbs} /><div className="pad"><Skeleton lines={5} height={44} /></div></>
  if (!site)
    return <><TopBar crumbs={[{ label: 'Home', href: href('/') }, { label: `Site ${siteId}` }]} /><EmptyState title="Site not found" /></>

  const total = scans.data?.total ?? 0
  return (
    <>
      <TopBar
        crumbs={crumbs}
        actions={(
          <>
            <Link className="btn" to={routeHref({ name: 'compare', siteId, base: null, head: null })}>Compare</Link>
            {client.mode !== 'static' && latest && <button type="button" className="btn btn-primary" onClick={() => void restart()} disabled={busy}>Rescan</button>}
          </>
        )}
      />
      {error && <p className="field-error pad-x" role="alert">{error}</p>}
      <Hero title={plural(total, 'scan')} sub={<a className="link" href={site.origin} target="_blank" rel="noreferrer">{site.origin}</a>} />
      {scans.error && <ErrorState error={scans.error} onRetry={scans.reload} />}
      {!scans.data && !scans.error && <div className="pad"><Skeleton lines={5} height={44} /></div>}
      {scans.data && scans.data.items.length === 0 && <EmptyState title="No scans" compact />}
      {scans.data && scans.data.items.length > 0 && (
        <>
          <div className="scroll-x">
            <div role="list" className="site-rows">
              {scans.data.items.map((scan, index) => <ScanRow key={scan.id} scan={scan} number={total - offset - index} />)}
            </div>
          </div>
          <PaginationBar offset={offset} limit={LIMIT} total={total} onChange={setOffset} />
        </>
      )}
    </>
  )
}
