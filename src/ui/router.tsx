import { useSyncExternalStore, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react'
import type { Device } from '../types.ts'

export type ScanTab = 'overview' | 'pages' | 'issues' | 'links'

export type Route =
  | { name: 'sites' }
  | { name: 'site', siteId: number }
  | { name: 'scan', scanId: string, tab: ScanTab }
  | { name: 'page', scanId: string, url: string, device: Device }
  | { name: 'compare', siteId: number | null, base: string | null, head: string | null }
  | { name: 'not-found', path: string }

const PRESERVED = ['mock']
const TABS: ScanTab[] = ['overview', 'pages', 'issues', 'links']

type Params = Record<string, string | number | null | undefined>

let hashRouting = false

export function enableHashRouting(): void {
  hashRouting = true
}

function current(): string {
  if (!hashRouting)
    return location.pathname + location.search
  const value = location.hash.slice(1)
  return value.startsWith('/') ? value : `/${value}`
}

export function href(path: string, params: Params = {}): string {
  const search = new URLSearchParams()
  const now = current()
  const currentParams = new URLSearchParams(now.includes('?') ? now.slice(now.indexOf('?')) : '')
  for (const key of PRESERVED) {
    if (currentParams.has(key))
      search.set(key, currentParams.get(key) ?? '')
  }
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== '')
      search.set(key, String(value))
  }
  const query = search.toString().replace(/=(&|$)/g, '$1')
  const target = query ? `${path}?${query}` : path
  return hashRouting ? `#${target}` : target
}

export function routeHref(route: Route): string {
  switch (route.name) {
    case 'sites': return href('/')
    case 'site': return href(`/sites/${route.siteId}`)
    case 'scan': return href(route.tab === 'overview' ? `/scans/${encodeURIComponent(route.scanId)}` : `/scans/${encodeURIComponent(route.scanId)}/${route.tab}`)
    case 'page': return href(`/scans/${encodeURIComponent(route.scanId)}/page`, { url: route.url, device: route.device })
    case 'compare': return href('/compare', { site: route.siteId, base: route.base, head: route.head })
    case 'not-found': return href(route.path)
  }
}

export function parseRoute(pathname: string, search: string): Route {
  const params = new URLSearchParams(search)
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent)
  if (parts.length === 0)
    return { name: 'sites' }
  if (parts[0] === 'sites' && parts.length === 2 && /^\d+$/.test(parts[1] ?? ''))
    return { name: 'site', siteId: Number(parts[1]) }
  if (parts[0] === 'scans' && parts[1]) {
    const scanId = parts[1]
    if (parts.length === 2)
      return { name: 'scan', scanId, tab: 'overview' }
    if (parts.length === 3 && parts[2] === 'page') {
      const url = params.get('url')
      const device = params.get('device') === 'desktop' ? 'desktop' : 'mobile'
      if (url)
        return { name: 'page', scanId, url, device }
    }
    if (parts.length === 3 && TABS.includes(parts[2] as ScanTab))
      return { name: 'scan', scanId, tab: parts[2] as ScanTab }
  }
  if (parts[0] === 'compare' && parts.length === 1) {
    const site = params.get('site')
    return { name: 'compare', siteId: site && /^\d+$/.test(site) ? Number(site) : null, base: params.get('base'), head: params.get('head') }
  }
  return { name: 'not-found', path: pathname }
}

const NAVIGATE = 'unlighthouse:navigate'

function subscribe(callback: () => void): () => void {
  window.addEventListener('popstate', callback)
  window.addEventListener('hashchange', callback)
  window.addEventListener(NAVIGATE, callback)
  return () => {
    window.removeEventListener('popstate', callback)
    window.removeEventListener('hashchange', callback)
    window.removeEventListener(NAVIGATE, callback)
  }
}

function snapshot(): string {
  return current()
}

export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const target = hashRouting && to.startsWith('#') ? to.slice(1) : to
  if (target === snapshot())
    return
  if (hashRouting && options.replace)
    location.replace(`#${target}`)
  else if (hashRouting)
    location.hash = target
  else if (options.replace)
    history.replaceState(null, '', target)
  else
    history.pushState(null, '', target)
  window.dispatchEvent(new Event(NAVIGATE))
  if (!options.replace)
    window.scrollTo(0, 0)
}

export function useLocation(): { pathname: string, search: string } {
  const value = useSyncExternalStore(subscribe, snapshot, () => '/')
  const index = value.indexOf('?')
  return index === -1 ? { pathname: value, search: '' } : { pathname: value.slice(0, index), search: value.slice(index) }
}

export function useRoute(): Route {
  const { pathname, search } = useLocation()
  return parseRoute(pathname, search)
}

export function useSearchParams(): [URLSearchParams, (next: Params, options?: { replace?: boolean }) => void] {
  const { pathname, search } = useLocation()
  const params = new URLSearchParams(search)
  const update = (next: Params, options: { replace?: boolean } = { replace: true }) => {
    const merged: Params = {}
    for (const [key, value] of params)
      merged[key] = value
    Object.assign(merged, next)
    navigate(href(pathname, merged), options)
  }
  return [params, update]
}

export function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && !event.defaultPrevented
}

export function Link({ to, children, onClick, ...rest }: { to: string, children: ReactNode } & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <a
      {...rest}
      href={to}
      onClick={(event) => {
        onClick?.(event)
        if (!isPlainClick(event) || rest.target)
          return
        event.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
