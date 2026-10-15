import { useState, type FormEvent } from 'react'
import { CATEGORIES, DEVICES, type Device } from '../../types.ts'
import { useClient, useDocumentTitle, useQuery } from '../hooks.ts'
import { CATEGORY_SHORT, CATEGORY_LABELS, formatRelative, hostOf } from '../format.ts'
import { href, Link, navigate, routeHref } from '../router.tsx'
import { DeviceLabel, EmptyState, ErrorState, Skeleton, StatusBadge } from '../components/controls.tsx'
import { Card, PageHead, useBreadcrumbs } from '../components/layout.tsx'
import { Score } from '../components/score.tsx'
import type { SiteListItem } from '../shapes.ts'

export function StartScanForm({ initialUrl = '', onStarted }: { initialUrl?: string, onStarted?: (scanId: string) => void }) {
  const client = useClient()
  const [url, setUrl] = useState(initialUrl)
  const [devices, setDevices] = useState<Device[]>(['mobile', 'desktop'])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    let site: string
    try {
      site = new URL(/^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`).href
    }
    catch {
      setError('Enter a full URL, for example https://example.com')
      return
    }
    if (devices.length === 0) {
      setError('Pick at least one device')
      return
    }
    setBusy(true)
    try {
      const scan = await client.call('scans.start', { site, devices })
      if (onStarted)
        onStarted(scan.id)
      else
        navigate(routeHref({ name: 'scan', scanId: scan.id, tab: 'overview' }))
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setBusy(false)
    }
  }

  const toggle = (device: Device) => setDevices(list => list.includes(device) ? list.filter(d => d !== device) : DEVICES.filter(d => d === device || list.includes(d)))

  return (
    <form className="stack-sm" onSubmit={submit} noValidate>
      <div className="form-grid">
        <label className="field">
          <span>Site URL</span>
          <input
            className="input"
            type="url"
            inputMode="url"
            placeholder="https://example.com"
            value={url}
            onChange={event => setUrl(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'scan-error' : undefined}
            required
            autoComplete="url"
            spellCheck={false}
          />
        </label>
        <fieldset className="field" style={{ border: 0, margin: 0, padding: 0 }}>
          <legend className="field-label" style={{ padding: 0, marginBottom: 4 }}>Devices</legend>
          <div className="row" style={{ height: 32 }}>
            {DEVICES.map(device => (
              <label key={device} className="checkbox">
                <input type="checkbox" checked={devices.includes(device)} onChange={() => toggle(device)} />
                <DeviceLabel device={device} />
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className="btn btn-primary" disabled={busy || url.trim() === ''}>
          {busy ? 'Starting…' : 'Start scan'}
        </button>
      </div>
      {error && <p id="scan-error" className="field-error" role="alert">{error}</p>}
    </form>
  )
}

function SiteCard({ site }: { site: SiteListItem }) {
  const last = site.lastScan
  const devices = DEVICES.filter(d => site.lastScores[d])
  const to = last ? routeHref({ name: 'scan', scanId: last.id, tab: 'overview' }) : routeHref({ name: 'site', siteId: site.id })
  return (
    <article className="card card-link site-card">
      <div className="site-card-head">
        <div style={{ minWidth: 0 }}>
          <Link to={to} className="site-card-title">{hostOf(site.origin)}</Link>
          <div className="faint" style={{ fontSize: 'var(--text-sm)' }}>{site.origin}</div>
        </div>
        {last && <StatusBadge status={last.status} />}
      </div>
      {devices.length > 0
        ? (
            <div className="site-card-scores" role="table" aria-label={`Latest scores for ${hostOf(site.origin)}`}>
              <div className="site-card-cats" role="row">
                <span role="columnheader"><span className="sr-only">Device</span></span>
                {CATEGORIES.map(c => <span key={c} role="columnheader" title={CATEGORY_LABELS[c]}>{CATEGORY_SHORT[c]}</span>)}
              </div>
              {devices.map(device => (
                <div key={device} className="site-card-device" role="row">
                  <span role="rowheader"><DeviceLabel device={device} /></span>
                  {CATEGORIES.map(c => <span key={c} role="cell"><Score score={site.lastScores[device]?.[c]} label={CATEGORY_LABELS[c]} /></span>)}
                </div>
              ))}
            </div>
          )
        : <p className="muted" style={{ fontSize: 'var(--text-sm)' }}>{last?.status === 'failed' ? last.error ?? 'Last scan failed.' : 'No finished scan yet.'}</p>}
      <div className="site-card-foot">
        <span>{last ? `Last scan ${formatRelative(last.createdAt)}` : 'Never scanned'}</span>
        <Link to={routeHref({ name: 'site', siteId: site.id })} className="link">{`${site.scans} ${site.scans === 1 ? 'scan' : 'scans'}`}</Link>
      </div>
    </article>
  )
}

export function SitesPage() {
  const client = useClient()
  useBreadcrumbs([{ label: 'Sites' }])
  useDocumentTitle('Sites')
  const sites = useQuery('sites.list', {})
  return (
    <div className="stack">
      <PageHead title="Sites" meta={<span>Every site you have scanned, with its latest scores.</span>} />
      {client.mode !== 'static' && (
        <Card title="New scan" id="new-scan">
          <StartScanForm />
        </Card>
      )}
      {sites.error && <ErrorState error={sites.error} onRetry={sites.reload} />}
      {!sites.data && !sites.error && (
        <div className="site-grid">
          {[0, 1, 2].map(i => <div key={i} className="card site-card"><Skeleton lines={4} /></div>)}
        </div>
      )}
      {sites.data && sites.data.length === 0 && (
        <EmptyState title="No sites yet">Start a scan above. Unlighthouse discovers pages from robots.txt, sitemaps and links, then audits a sample of every template.</EmptyState>
      )}
      {sites.data && sites.data.length > 0 && (
        <div className="site-grid">
          {sites.data.map(site => <SiteCard key={site.id} site={site} />)}
        </div>
      )}
      <p className="faint" style={{ fontSize: 'var(--text-sm)' }}>
        {'Scores are averages over audited pages of the latest finished scan. '}
        <Link to={href('/compare')} className="link">Compare two scans</Link>
      </p>
    </div>
  )
}
