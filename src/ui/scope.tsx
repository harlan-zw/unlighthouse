import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { ScanSummary } from '../analysis/summary.ts'
import type { TemplateCount } from '../contracts.ts'
import type { Scan } from '../types.ts'
import { isActive } from './components/controls.tsx'
import { useQuery, useScanEvents } from './hooks.ts'

export interface SiteScans {
  items: Scan[] | undefined
  total: number
  numberOf: (scanId: string) => number | null
}

export function useSiteScans(origin: string | null, refresh = 0): SiteScans {
  const query = useQuery('scans.list', origin ? { origin, limit: 100, offset: 0 } : null, refresh)
  const items = query.data?.items
  const total = query.data?.total ?? 0
  return {
    items,
    total,
    numberOf(scanId) {
      const index = items?.findIndex(scan => scan.id === scanId) ?? -1
      return index < 0 ? null : total - index
    },
  }
}

export interface ScanScopeValue {
  scanId: string | null
  scan: Scan | undefined
  summary: ScanSummary | undefined
  templates: TemplateCount[] | undefined
  siteScans: SiteScans
  refresh: number
  error: Error | null
  reload: () => void
}

export function useScanScope(scanId: string | null, origin: string | null = null): ScanScopeValue {
  const query = useQuery('scans.get', scanId ? { scanId } : null)
  const [patch, setPatch] = useState<Partial<Scan>>({})
  const [refresh, setRefresh] = useState(0)
  const dirty = useRef(false)
  const scan = query.data && query.data.id === scanId ? { ...query.data, ...patch } : undefined
  const active = scan ? isActive(scan.status) : false

  useEffect(() => setPatch({}), [scanId, query.data])

  useScanEvents(active ? scanId : null, (event) => {
    if (event.type === 'scan:progress') {
      const { type: _type, scanId: _id, ...stats } = event
      setPatch(prev => ({ ...prev, stats }))
    }
    else if (event.type === 'scan:status') {
      setPatch(prev => ({ ...prev, status: event.status }))
      query.reload()
      setRefresh(n => n + 1)
    }
    else if (event.type === 'page:status' && (event.status === 'done' || event.status === 'failed')) {
      dirty.current = true
    }
  })

  useEffect(() => {
    if (!active)
      return
    const timer = setInterval(() => {
      if (dirty.current) {
        dirty.current = false
        setRefresh(n => n + 1)
      }
    }, 4000)
    return () => clearInterval(timer)
  }, [active])

  const summary = useQuery('scans.summary', scanId ? { scanId } : null, refresh)
  const templates = useQuery('scans.templates', scanId ? { scanId } : null, refresh)
  const siteScans = useSiteScans(scan?.origin ?? origin, refresh)

  return {
    scanId,
    scan,
    summary: summary.data?.scan.id === scanId ? summary.data : undefined,
    templates: templates.current ? templates.data : undefined,
    siteScans,
    refresh,
    error: query.error,
    reload: query.reload,
  }
}

export const ScopeContext = createContext<ScanScopeValue | null>(null)

export function ScanScope({ scanId, children }: { scanId: string, children: ReactNode }) {
  const scope = useScanScope(scanId)
  return <ScopeContext value={scope}>{children}</ScopeContext>
}

export function useScope(): ScanScopeValue {
  const scope = useContext(ScopeContext)
  if (!scope)
    throw new Error('ScanScope is missing')
  return scope
}

export function samplePerTemplate(scan: Scan): number {
  const value = (scan.options as { sampling?: { perTemplate?: unknown } } | null)?.sampling?.perTemplate
  return typeof value === 'number' ? value : 5
}
