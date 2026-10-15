import { useState } from 'react'
import type { Client } from './api.ts'
import { CrumbsContext, type Crumb } from './components/layout.tsx'
import { EmptyState } from './components/controls.tsx'
import { ClientContext } from './hooks.ts'
import { href, Link, useRoute } from './router.tsx'
import { ComparePage } from './screens/Compare.tsx'
import { PageDetailPage } from './screens/PageDetail.tsx'
import { ScanPage } from './screens/Scan.tsx'
import { SitePage } from './screens/Site.tsx'
import { SitesPage } from './screens/Sites.tsx'
import { useTheme, type ThemePreference } from './theme.ts'

function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const order: ThemePreference[] = ['system', 'light', 'dark']
  const next = order[(order.indexOf(theme) + 1) % order.length] ?? 'system'
  const label = `Theme: ${theme}. Switch to ${next}.`
  return (
    <button type="button" className="btn btn-ghost btn-icon" onClick={() => setTheme(next)} aria-label={label} title={label}>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {theme === 'light' && <><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" /></>}
        {theme === 'dark' && <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />}
        {theme === 'system' && <><rect x="1.5" y="2.5" width="13" height="9" rx="1" /><path d="M5.5 14h5M8 11.5V14" /><path d="M8 4.5v4.5" opacity="0" /><path d="M1.5 2.5h6.5v9H1.5Z" fill="currentColor" stroke="none" opacity="0.35" /></>}
      </svg>
    </button>
  )
}

function Brand() {
  return (
    <Link to={href('/')} className="brand" aria-label="Unlighthouse home">
      <svg className="brand-mark" viewBox="0 0 20 20" aria-hidden="true">
        <rect width="20" height="20" rx="5" fill="var(--text)" />
        <path d="M10 4.5c1.9 2.2 3 3.9 3 5.6a3 3 0 0 1-6 0c0-1.7 1.1-3.4 3-5.6Z" fill="var(--bg)" />
        <path d="M7.5 15.5h5" stroke="var(--bg)" strokeWidth="1.4" strokeLinecap="round" />
      </svg>
      <span className="brand-text">Unlighthouse</span>
    </Link>
  )
}

function Screen() {
  const route = useRoute()
  switch (route.name) {
    case 'sites': return <SitesPage />
    case 'site': return <SitePage siteId={route.siteId} />
    case 'scan': return <ScanPage key={route.scanId} scanId={route.scanId} tab={route.tab} />
    case 'page': return <PageDetailPage key={`${route.scanId}:${route.url}:${route.device}`} scanId={route.scanId} url={route.url} device={route.device} />
    case 'compare': return <ComparePage siteId={route.siteId} base={route.base} head={route.head} />
    case 'not-found':
      return <EmptyState title="Page not found" action={<Link className="btn" to={href('/')}>Go to sites</Link>}>{`Nothing lives at ${route.path}.`}</EmptyState>
  }
}

export function App({ client }: { client: Client }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([])
  return (
    <ClientContext value={client}>
      <CrumbsContext value={setCrumbs}>
        <a className="skip-link" href="#main">Skip to content</a>
        <header className="app-header">
          <div className="app-header-inner">
            <Brand />
            <nav className="breadcrumbs" aria-label="Breadcrumb">
              <ol>
                {crumbs.map((crumb, i) => (
                  <li key={`${crumb.label}-${i}`}>
                    {crumb.href && i < crumbs.length - 1
                      ? <Link to={crumb.href} className="truncate">{crumb.label}</Link>
                      : <span aria-current="page" className="truncate">{crumb.label}</span>}
                  </li>
                ))}
              </ol>
            </nav>
            <div className="header-actions">
              {client.mode !== 'live' && <span className="mode-pill" title={client.mode === 'mock' ? 'Generated demo data' : 'Static snapshot'}>{client.mode}</span>}
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main id="main" tabIndex={-1}>
          <Screen />
        </main>
      </CrumbsContext>
    </ClientContext>
  )
}
