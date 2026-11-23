import { useEffect, useRef, useState, type ReactNode } from 'react'
import { formatCount, formatWhen, hostOf, shortCommit, siteTint } from '../format.ts'
import { useQuery } from '../hooks.ts'
import { href, Link, routeHref } from '../router.tsx'
import type { ScanScopeValue } from '../scope.tsx'
import type { Site } from '../../types.ts'
import { CopyButton } from './layout.tsx'
import { isActive } from './controls.tsx'

export type NavKey = 'home' | 'issues' | 'pages' | 'templates' | 'links' | 'scans' | 'compare'

export function SiteTile({ host, size = 18 }: { host: string, size?: number }) {
  return (
    <span className="site-tile" style={{ background: siteTint(host), width: size, height: size, fontSize: size > 20 ? 13 : 11 }} aria-hidden="true">
      {host.charAt(0).toUpperCase()}
    </span>
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

function AgentBox() {
  return (
    <div className="agent-box">
      <span className="agent-title">Agent access</span>
      <CopyButton text="unlighthouse mcp" className="code-copy"><code>unlighthouse mcp</code></CopyButton>
    </div>
  )
}

function NavItem({ to, active, count, dot, children }: { to: string, active: boolean, count?: number | null | undefined, dot?: boolean, children: ReactNode }) {
  return (
    <Link to={to} className="nav-item" aria-current={active ? 'page' : undefined}>
      <span>{children}</span>
      {dot && <span className="nav-dot" role="img" aria-label="Scan running" />}
      {count !== undefined && count !== null && <span className="nav-count num">{formatCount(count)}</span>}
    </Link>
  )
}

export function HomeSidebar({ active }: { active: NavKey }) {
  const sites = useQuery('sites.list', {})
  const list = sites.data ?? []
  const running = list.find(site => site.lastScan && isActive(site.lastScan.status))
  const first = running ?? list[0]
  const scansTo = running?.lastScan ? routeHref({ name: 'scan', scanId: running.lastScan.id }) : first ? routeHref({ name: 'site', siteId: first.id }) : null
  return (
    <nav className="sidebar" aria-label="Main">
      <Brand />
      <div className="nav-group">
        <NavItem to={href('/')} active={active === 'home'}>Home</NavItem>
        {scansTo && <NavItem to={scansTo} active={active === 'scans'} dot={Boolean(running)}>Scans</NavItem>}
      </div>
      <div className="nav-group">
        <span className="nav-label">Sites</span>
        {list.map(site => (
          <Link key={site.id} to={site.lastScan ? routeHref({ name: 'scan', scanId: site.lastScan.id }) : routeHref({ name: 'site', siteId: site.id })} className="nav-item site-link">
            <SiteTile host={hostOf(site.origin)} />
            <span className="truncate">{hostOf(site.origin)}</span>
          </Link>
        ))}
      </div>
      <AgentBox />
    </nav>
  )
}

function Switcher({ scope, origin }: { scope: ScanScopeValue, origin: string | null }) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const { siteScans } = scope
  const scan = scope.scan ?? siteScans.items?.find(item => item.id === scope.scanId) ?? siteScans.items?.[0]
  useEffect(() => {
    if (!open)
      return
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node))
        setOpen(false)
    }
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        root.current?.querySelector<HTMLElement>('button')?.focus()
      }
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', key)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', key)
    }
  }, [open])
  const number = scan ? siteScans.numberOf(scan.id) : null
  const state = scan ? (isActive(scan.status) ? 'running' : formatWhen(scan.createdAt)) : '…'
  const host = origin ? hostOf(origin) : '…'
  return (
    <div className="switcher" ref={root}>
      <button type="button" className="switcher-button" aria-expanded={open} aria-controls="switcher-menu" onClick={() => setOpen(v => !v)}>
        <span className="switcher-text">
          <span className="switcher-host truncate">{host}</span>
          <span className="switcher-sub truncate">{scan ? `Scan ${number ? `#${number}` : scan.id} · ${state}` : state}</span>
        </span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M7 10l5-5 5 5M7 14l5 5 5-5" /></svg>
      </button>
      {open && (
        <ul className="switcher-menu" id="switcher-menu">
          {siteScans.items?.map((item) => {
            const n = siteScans.numberOf(item.id)
            const git = item.branch ? ` · ${item.branch}${item.commit ? ` · ${shortCommit(item.commit)}` : ''}` : ''
            return (
              <li key={item.id}>
                <Link to={routeHref({ name: 'scan', scanId: item.id })} aria-current={item.id === scan?.id ? 'true' : undefined} onClick={() => setOpen(false)}>
                  <span className="truncate">{`${n ? `#${n}` : item.id}${git}`}</span>
                  <span className="switcher-sub">{isActive(item.status) ? 'running' : item.status === 'done' ? formatWhen(item.createdAt) : item.status}</span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export function ScanSidebar({ scope, site, active }: { scope: ScanScopeValue, site?: Site | undefined, active: NavKey }) {
  const { scan, summary, templates, siteScans, scanId } = scope
  const siteId = site?.id ?? scan?.siteId ?? null
  const origin = site?.origin ?? scan?.origin ?? null
  const running = siteScans.items?.some(item => isActive(item.status)) ?? false
  return (
    <nav className="sidebar" aria-label="Main">
      <Brand />
      <Switcher scope={scope} origin={origin} />
      <div className="nav-group">
        {scanId && (
          <>
            <NavItem to={routeHref({ name: 'scan', scanId })} active={active === 'issues'} count={summary?.issueCount}>Issues</NavItem>
            <NavItem to={routeHref({ name: 'pages', scanId })} active={active === 'pages'} count={summary?.pages.discovered}>Pages</NavItem>
            <NavItem to={routeHref({ name: 'templates', scanId })} active={active === 'templates'} count={templates?.length}>Templates</NavItem>
            {summary !== undefined && summary.brokenLinks > 0 && <NavItem to={routeHref({ name: 'links', scanId })} active={active === 'links'} count={summary.brokenLinks}>Links</NavItem>}
          </>
        )}
        {siteId !== null && (
          <>
            <NavItem to={routeHref({ name: 'site', siteId })} active={active === 'scans'} count={siteScans.total || null} dot={running}>Scans</NavItem>
            <NavItem to={routeHref({ name: 'compare', siteId, base: null, head: null })} active={active === 'compare'}>Compare</NavItem>
          </>
        )}
      </div>
      <AgentBox />
    </nav>
  )
}

export function Frame({ sidebar, children }: { sidebar: ReactNode, children: ReactNode }) {
  return (
    <div className="app">
      {sidebar}
      <main id="main" className="content" tabIndex={-1}>{children}</main>
    </div>
  )
}
