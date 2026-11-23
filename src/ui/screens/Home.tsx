import { useState, type FormEvent } from 'react'
import { DEVICES } from '../../types.ts'
import { EmptyState, ErrorState, Skeleton } from '../components/controls.tsx'
import { TopBar } from '../components/layout.tsx'
import { FigureCells, useScanFigures } from '../components/rows.tsx'
import { SiteTile } from '../components/sidebar.tsx'
import { formatCount, hostOf } from '../format.ts'
import { useClient, useDocumentTitle, useQuery } from '../hooks.ts'
import { Link, navigate, routeHref } from '../router.tsx'
import type { SiteListItem } from '../shapes.ts'

type OptionKey = 'mobile' | 'desktop' | 'sample' | 'auth'

function ScanForm() {
  const client = useClient()
  const defaults = useQuery('config.defaults', {}).data
  const [url, setUrl] = useState('')
  const [picked, setPicked] = useState<Partial<Record<OptionKey, boolean>>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const perTemplate = defaults?.sampling.perTemplate ?? 5
  const authConfigured = defaults?.authConfigured ?? false
  const on: Record<OptionKey, boolean> = {
    mobile: picked.mobile ?? (defaults ? defaults.devices.includes('mobile') : true),
    desktop: picked.desktop ?? (defaults ? defaults.devices.includes('desktop') : true),
    sample: picked.sample ?? true,
    auth: authConfigured && (picked.auth ?? true),
  }
  const options: Array<{ key: OptionKey, label: string }> = [
    { key: 'mobile', label: 'Mobile' },
    { key: 'desktop', label: 'Desktop' },
    { key: 'sample', label: `${perTemplate} pages per template` },
    { key: 'auth', label: 'Requires login' },
  ]
  const devices = DEVICES.filter(device => on[device])

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)
    let site: string
    try {
      site = new URL(/^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`).href
    }
    catch {
      setError('Enter a full URL')
      return
    }
    setBusy(true)
    try {
      const scan = await client.call('scans.start', { site, devices, ...(on.sample ? {} : { sampling: { perTemplate: 0 } }), ...(authConfigured && !on.auth ? { auth: false } : {}) })
      navigate(routeHref({ name: 'scan', scanId: scan.id }))
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    finally {
      setBusy(false)
    }
  }

  return (
    <section className="new-scan" aria-labelledby="new-h">
      <div className="new-scan-inner">
        <h1 id="new-h">Scan a whole site</h1>
        <form className="new-scan-form" onSubmit={event => void submit(event)} noValidate>
          <label htmlFor="url" className="sr-only">Site URL</label>
          <input
            id="url"
            className="url-input"
            type="url"
            inputMode="url"
            placeholder="https://your-site.com"
            value={url}
            onChange={event => setUrl(event.target.value)}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? 'scan-error' : undefined}
            autoComplete="url"
            spellCheck={false}
          />
          <button type="submit" className="btn-scan" disabled={busy || url.trim() === '' || devices.length === 0}>Scan</button>
        </form>
        <div className="toggles">
          {options.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className="toggle"
              aria-pressed={on[key]}
              disabled={key === 'auth' && !authConfigured}
              title={key === 'auth' && !authConfigured ? 'Set auth in the config file' : undefined}
              onClick={() => setPicked(prev => ({ ...prev, [key]: !on[key] }))}
            >
              {label}
            </button>
          ))}
        </div>
        {error && <p id="scan-error" className="field-error" role="alert">{error}</p>}
      </div>
    </section>
  )
}

function SiteRow({ site }: { site: SiteListItem }) {
  const host = hostOf(site.origin)
  const last = site.lastScan
  const figures = useScanFigures(last)
  const templates = useQuery('scans.templates', last ? { scanId: last.id } : null)
  const meta = [
    figures.stats ? `${formatCount(figures.stats.discovered)} pages` : null,
    templates.data ? `${formatCount(templates.data.length)} templates` : null,
  ].filter(Boolean).join(' · ')
  return (
    <Link role="listitem" className="site-row" to={last ? routeHref({ name: 'scan', scanId: last.id }) : routeHref({ name: 'site', siteId: site.id })}>
      <span className="site-row-main">
        <SiteTile host={host} size={28} />
        <span className="stack-2">
          <span className="site-row-host truncate">{host}</span>
          <span className="faint small">{meta}</span>
        </span>
      </span>
      <FigureCells figures={figures} scan={last} />
    </Link>
  )
}

export function HomePage() {
  const client = useClient()
  const sites = useQuery('sites.list', {})
  useDocumentTitle('Home')
  return (
    <>
      <TopBar crumbs={[{ label: 'Home' }]} />
      {client.mode !== 'static' && <ScanForm />}
      <section aria-labelledby="sites-h">
        <div className="section-head">
          <h2 id="sites-h">Sites</h2>
          <span className="muted num">{sites.data?.length ?? ''}</span>
        </div>
        {sites.error && <ErrorState error={sites.error} onRetry={sites.reload} />}
        {!sites.data && !sites.error && <div className="pad"><Skeleton lines={4} height={44} /></div>}
        {sites.data && sites.data.length === 0 && <EmptyState title="No sites yet" compact />}
        {sites.data && sites.data.length > 0 && (
          <div className="scroll-x">
            <div role="list" className="site-rows">
              {sites.data.map(site => <SiteRow key={site.id} site={site} />)}
            </div>
          </div>
        )}
      </section>
    </>
  )
}
