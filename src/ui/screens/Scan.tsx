import { useEffect, useRef, useState } from 'react'
import type { UnlighthouseEvent } from '../../events.ts'
import type { Scan } from '../../types.ts'
import { useClient, useConnection, useDocumentTitle, useQuery, useScanEvents } from '../hooks.ts'
import { formatCount, formatDate, formatDuration, hostOf, pathOf } from '../format.ts'
import { href, routeHref, Link, type ScanTab } from '../router.tsx'
import { Badge, DeviceLabel, ErrorState, isActive, ProgressBar, Skeleton, StatusBadge, Tabs } from '../components/controls.tsx'
import { Callout, Card, PageHead, useBreadcrumbs } from '../components/layout.tsx'
import { Score } from '../components/score.tsx'
import { scanName } from './Site.tsx'
import { ScanOverview } from './ScanOverview.tsx'
import { ScanPages } from './ScanPages.tsx'
import { ScanIssues } from './ScanIssues.tsx'
import { ScanLinks } from './ScanLinks.tsx'

interface LogEntry {
  id: number
  at: number
  event: UnlighthouseEvent
}

function Connection() {
  const state = useConnection()
  const label = state === 'open' ? 'Live' : state === 'connecting' ? 'Connecting…' : 'Reconnecting…'
  return (
    <span className={`conn ${state}`} role="status">
      <span className="conn-dot" aria-hidden="true" />
      {label}
    </span>
  )
}

function eventLine(entry: LogEntry, scanId: string) {
  const { event } = entry
  const time = new Date(entry.at).toLocaleTimeString('en', { hour12: false })
  if (event.type === 'page:status') {
    return (
      <li key={entry.id}>
        <span className="faint num">{time}</span>
        <span className="truncate">
          {event.status === 'done' || event.status === 'failed'
            ? <Link to={routeHref({ name: 'page', scanId, url: event.url, device: event.device })} className="mono">{pathOf(event.url)}</Link>
            : <span className="mono">{pathOf(event.url)}</span>}
          <span className="faint">{` · ${event.device}`}</span>
        </span>
        {event.status === 'done' ? <Score score={event.score ?? null} label="Performance" /> : <StatusBadge status={event.status} />}
      </li>
    )
  }
  if (event.type === 'page:discovered') {
    return (
      <li key={entry.id}>
        <span className="faint num">{time}</span>
        <span className="truncate mono">{pathOf(event.url)}</span>
        <span className="chip">{event.template}</span>
      </li>
    )
  }
  if (event.type === 'scan:status') {
    return (
      <li key={entry.id}>
        <span className="faint num">{time}</span>
        <span className="truncate">{event.error ?? 'Scan status changed'}</span>
        <StatusBadge status={event.status} />
      </li>
    )
  }
  if (event.type === 'log') {
    return (
      <li key={entry.id}>
        <span className="faint num">{time}</span>
        <span className="truncate">{event.message}</span>
        <Badge tone={event.level === 'error' ? 'poor' : event.level === 'warn' ? 'average' : 'neutral'}>{event.level}</Badge>
      </li>
    )
  }
  return null
}

function LivePanel({ scan, log, onCancel, cancelling }: { scan: Scan, log: LogEntry[], onCancel: () => void, cancelling: boolean }) {
  const { stats } = scan
  const total = stats.done + stats.failed + stats.queued
  const finished = stats.done + stats.failed
  const discovering = scan.status === 'discovering' || scan.status === 'queued'
  return (
    <Card
      className="live-panel"
      title={scan.status === 'queued' ? 'Waiting to start' : discovering ? 'Discovering pages' : 'Auditing pages'}
      hint={<Connection />}
      actions={<button type="button" className="btn btn-sm" onClick={onCancel} disabled={cancelling}>{cancelling ? 'Cancelling…' : 'Cancel scan'}</button>}
    >
      <div className="live-grid">
        <div className="stack-sm">
          <ProgressBar
            label="Scan progress"
            value={finished}
            max={total}
            indeterminate={discovering || total === 0}
            segments={[
              { value: stats.done, tone: 'good', label: 'Done' },
              { value: stats.failed, tone: 'poor', label: 'Failed' },
            ]}
          />
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <span className="num" style={{ fontSize: 'var(--text-lg)', fontWeight: 600 }}>
              {discovering ? `${formatCount(stats.discovered)} pages found` : `${formatCount(finished)} / ${formatCount(total)} audits`}
            </span>
            {!discovering && total > 0 && <span className="muted num">{`${Math.round((finished / total) * 100)}%`}</span>}
          </div>
          <div className="legend">
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--good-ring)' }} />{`${formatCount(stats.done)} done`}</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--poor-ring)' }} />{`${formatCount(stats.failed)} failed`}</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--ring-track)', border: '1px solid var(--border-strong)' }} />{`${formatCount(stats.queued)} queued`}</span>
            <span className="legend-item">{`${formatCount(stats.skipped)} skipped by sampling`}</span>
          </div>
          {scan.startedAt && <span className="faint" style={{ fontSize: 'var(--text-sm)' }}>{`Running for ${formatDuration(Date.now() - scan.startedAt)}`}</span>}
        </div>
        <div>
          <h3 className="sr-only">Recent activity</h3>
          {log.length === 0
            ? <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>Waiting for events…</p>
            : <ul className="event-log" aria-live="polite" aria-relevant="additions">{log.map(entry => eventLine(entry, scan.id))}</ul>}
        </div>
      </div>
    </Card>
  )
}

export function ScanPage({ scanId, tab }: { scanId: string, tab: ScanTab }) {
  const client = useClient()
  const query = useQuery('scans.get', { scanId })
  const [scan, setScan] = useState<Scan | null>(null)
  const [log, setLog] = useState<LogEntry[]>([])
  const [refresh, setRefresh] = useState(0)
  const [cancelling, setCancelling] = useState(false)
  const dirty = useRef(false)
  const seq = useRef(0)

  useEffect(() => {
    if (query.data)
      setScan(query.data)
  }, [query.data])

  const active = scan ? isActive(scan.status) : false

  useScanEvents(active ? scanId : null, (event) => {
    if (event.type === 'scan:progress') {
      const { type: _type, scanId: _id, ...stats } = event
      setScan(prev => prev ? { ...prev, stats } : prev)
      return
    }
    if (event.type === 'scan:status') {
      setScan(prev => prev ? { ...prev, status: event.status, error: event.error ?? prev.error } : prev)
      query.reload()
      setRefresh(n => n + 1)
    }
    if (event.type === 'page:status' && (event.status === 'done' || event.status === 'failed'))
      dirty.current = true
    if (event.type === 'page:status' && event.status === 'running')
      return
    setLog(prev => [{ id: ++seq.current, at: Date.now(), event }, ...prev].slice(0, 40))
  })

  useEffect(() => {
    if (!active)
      return
    const timer = setInterval(() => {
      if (dirty.current) {
        dirty.current = false
        setRefresh(n => n + 1)
      }
    }, 5000)
    return () => clearInterval(timer)
  }, [active])

  const host = scan ? hostOf(scan.origin) : '…'
  useBreadcrumbs(scan
    ? [{ label: 'Sites', href: href('/') }, { label: host, href: routeHref({ name: 'site', siteId: scan.siteId }) }, { label: scanName(scan) }]
    : [{ label: 'Sites', href: href('/') }, { label: scanId }])
  useDocumentTitle(scan ? `${scanName(scan)} · ${host}` : 'Scan')

  if (query.error && !scan)
    return <ErrorState error={query.error} onRetry={query.reload} />
  if (!scan)
    return <Skeleton lines={8} />

  const cancel = async () => {
    setCancelling(true)
    try {
      setScan(await client.call('scans.cancel', { scanId }))
    }
    catch {
      query.reload()
    }
    finally {
      setCancelling(false)
    }
  }

  const base = routeHref({ name: 'scan', scanId, tab: 'overview' })
  const tabs = [
    { id: 'overview', label: 'Overview', href: base },
    { id: 'pages', label: 'Pages', href: routeHref({ name: 'scan', scanId, tab: 'pages' }), count: scan.stats.done + scan.stats.failed + scan.stats.queued + scan.stats.skipped },
    { id: 'issues', label: 'Issues', href: routeHref({ name: 'scan', scanId, tab: 'issues' }) },
    { id: 'links', label: 'Broken links', href: routeHref({ name: 'scan', scanId, tab: 'links' }) },
  ]

  return (
    <div>
      <PageHead
        eyebrow={host}
        title={scanName(scan)}
        meta={(
          <>
            <StatusBadge status={scan.status} />
            <span>{formatDate(scan.createdAt)}</span>
            {scan.branch && <span className="chip" title={scan.commit ?? undefined}>{scan.commit ? `${scan.branch} @ ${scan.commit.slice(0, 7)}` : scan.branch}</span>}
            <span className="row" style={{ gap: 'var(--space-3)' }}>{scan.devices.map(d => <DeviceLabel key={d} device={d} />)}</span>
            {scan.finishedAt && scan.startedAt && <span>{`took ${formatDuration(scan.finishedAt - scan.startedAt)}`}</span>}
            {scan.lighthouseVersion && <span>{`Lighthouse ${scan.lighthouseVersion}`}</span>}
          </>
        )}
        actions={<a className="btn" href={scan.origin} target="_blank" rel="noreferrer">Open site</a>}
      />
      {active && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <LivePanel scan={scan} log={log} onCancel={cancel} cancelling={cancelling} />
        </div>
      )}
      {scan.status === 'failed' && (
        <div style={{ marginBottom: 'var(--space-5)' }}>
          <Callout tone="poor" title="Scan failed">{scan.error ?? 'The scan stopped before it finished.'}</Callout>
        </div>
      )}
      {scan.status === 'failed' && scan.stats.done + scan.stats.failed === 0
        ? null
        : (
            <>
              <Tabs items={tabs} active={tab} label="Scan sections" idPrefix="scan-tab" />
              <div role="tabpanel" id="scan-tab-panel" aria-labelledby={`scan-tab-${tab}`}>
                {tab === 'overview' && <ScanOverview scan={scan} refresh={refresh} />}
                {tab === 'pages' && <ScanPages scan={scan} refresh={refresh} />}
                {tab === 'issues' && <ScanIssues scan={scan} refresh={refresh} />}
                {tab === 'links' && <ScanLinks scan={scan} refresh={refresh} />}
              </div>
            </>
          )}
    </div>
  )
}
