import type { ReactNode } from 'react'
import type { Site } from '../types.ts'
import type { Client } from './api.ts'
import { EmptyState, isActive } from './components/controls.tsx'
import { HomeSidebar, Frame, ScanSidebar, type NavKey } from './components/sidebar.tsx'
import { ClientContext, useQuery } from './hooks.ts'
import { href, Link, Redirect, useRoute } from './router.tsx'
import { ScopeContext, useScanScope, useSiteScans } from './scope.tsx'
import { ComparePage } from './screens/Compare.tsx'
import { HomePage } from './screens/Home.tsx'
import { IssueDetailPage } from './screens/IssueDetail.tsx'
import { LinksPage } from './screens/ScanLinks.tsx'
import { PageDetailPage } from './screens/PageDetail.tsx'
import { PagesPage } from './screens/ScanPages.tsx'
import { ScanPage } from './screens/Scan.tsx'
import { SitePage } from './screens/Site.tsx'
import { TemplatesPage } from './screens/Templates.tsx'

function ScanFrame({ scanId, active, children }: { scanId: string, active: NavKey, children: ReactNode }) {
  const scope = useScanScope(scanId)
  return (
    <ScopeContext value={scope}>
      <Frame sidebar={<ScanSidebar scope={scope} active={active} />}>{children}</Frame>
    </ScopeContext>
  )
}

function SiteFrame({ siteId, preferred, active, children }: { siteId: number | null, preferred: string | null, active: NavKey, children: ReactNode }) {
  const sites = useQuery('sites.list', {})
  const site: Site | undefined = siteId === null ? undefined : sites.data?.find(s => s.id === siteId)
  const list = useSiteScans(site?.origin ?? null)
  const target = site ? preferred ?? list.items?.find(scan => scan.status === 'done' || isActive(scan.status))?.id ?? list.items?.[0]?.id ?? null : null
  const scope = useScanScope(target, site?.origin ?? null)
  return (
    <Frame sidebar={site ? <ScanSidebar scope={scope} site={site} active={active} /> : <HomeSidebar active="home" />}>{children}</Frame>
  )
}

function Screen() {
  const route = useRoute()
  switch (route.name) {
    case 'home':
      return <Frame sidebar={<HomeSidebar active="home" />}><HomePage /></Frame>
    case 'site':
      return <SiteFrame siteId={route.siteId} preferred={null} active="scans"><SitePage siteId={route.siteId} /></SiteFrame>
    case 'compare':
      return <SiteFrame siteId={route.siteId} preferred={route.head} active="compare"><ComparePage siteId={route.siteId} base={route.base} head={route.head} /></SiteFrame>
    case 'scan':
      return <ScanFrame key={route.scanId} scanId={route.scanId} active="issues"><ScanPage /></ScanFrame>
    case 'issue':
      return <ScanFrame key={route.scanId} scanId={route.scanId} active="issues"><IssueDetailPage key={route.auditId} auditId={route.auditId} /></ScanFrame>
    case 'templates':
      return <ScanFrame key={route.scanId} scanId={route.scanId} active="templates"><TemplatesPage /></ScanFrame>
    case 'pages':
      return <ScanFrame key={route.scanId} scanId={route.scanId} active="pages"><PagesPage /></ScanFrame>
    case 'links':
      return <ScanFrame key={route.scanId} scanId={route.scanId} active="links"><LinksPage /></ScanFrame>
    case 'page':
      return <ScanFrame key={route.scanId} scanId={route.scanId} active="pages"><PageDetailPage key={`${route.url}:${route.device}`} scanId={route.scanId} url={route.url} device={route.device} /></ScanFrame>
    case 'redirect':
      return <Redirect to={route.to} />
    case 'not-found':
      return (
        <Frame sidebar={<HomeSidebar active="home" />}>
          <EmptyState title="Page not found" action={<Link className="btn" to={href('/')}>Home</Link>}>{route.path}</EmptyState>
        </Frame>
      )
  }
}

export function App({ client }: { client: Client }) {
  return (
    <ClientContext value={client}>
      <a className="skip-link" href="#main">Skip to content</a>
      <Screen />
    </ClientContext>
  )
}
