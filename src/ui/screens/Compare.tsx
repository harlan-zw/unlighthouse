import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import type { BudgetResult } from '../../analysis/budgets.ts'
import type { IssueDiff } from '../../analysis/compare.ts'
import { SITE_CHECK_IDS } from '../../analysis/summary.ts'
import { CATEGORIES, type Category, type Metric, type Scan } from '../../types.ts'
import { EmptyState, ErrorState, Skeleton } from '../components/controls.tsx'
import { CategoryPill } from '../components/issues.tsx'
import { Hero, TopBar } from '../components/layout.tsx'
import { CATEGORY_LABELS, formatCount, formatMetric, formatScore, formatWhen, hostOf, METRIC_SHORT, plural, scoreRating, shortCommit } from '../format.ts'
import { useDocumentTitle, useQuery } from '../hooks.ts'
import { href, Link, navigate, routeHref } from '../router.tsx'
import { average, categoryMedian } from '../scores.ts'
import { useSiteScans } from '../scope.tsx'

type Tab = 'new' | 'regressed' | 'fixed'

function scanOption(scan: Scan, number: number | null): string {
  const label = number ? `#${number}` : scan.id
  if (!scan.branch)
    return `${label} · ${formatWhen(scan.createdAt)}`
  return [label, scan.branch, shortCommit(scan.commit)].filter(Boolean).join(' · ')
}

function budgetText(result: BudgetResult): string {
  const [kind = '', name = ''] = result.rule.split(':')
  const limit = result.limit
  let text: string
  if (kind === 'score')
    text = `${CATEGORY_LABELS[name as Category]?.toLowerCase() ?? name} below ${Math.round(limit * 100)}`
  else if (kind === 'metric')
    text = `${METRIC_SHORT[name as Metric] ?? name} over ${formatMetric(name as Metric, limit)}`
  else if (kind === 'regression')
    text = `${CATEGORY_LABELS[name as Category]?.toLowerCase() ?? name} dropped over ${Math.round(limit * 100)}`
  else if (result.rule === 'new-issues')
    text = `new issues over ${limit}`
  else
    text = `${result.rule.replace(/[:_-]+/g, ' ')} limit ${limit}`
  const plain = result.scope === 'site' || result.scope === 'mobile' || result.scope === 'desktop'
  return plain ? text : `${text} (${result.scope})`
}

function Picker({ label, value, onChange, children, disabled }: { label: string, value: string, onChange: (value: string) => void, children: ReactNode, disabled?: boolean }) {
  return (
    <label className="pick">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={event => onChange(event.target.value)} disabled={disabled}>{children}</select>
    </label>
  )
}

export function ComparePage({ siteId, base, head }: { siteId: number | null, base: string | null, head: string | null }) {
  const sites = useQuery('sites.list', {})
  const site = siteId === null ? undefined : sites.data?.find(s => s.id === siteId)
  const siteScans = useSiteScans(site?.origin ?? null)
  const done = siteScans.items?.filter(s => s.status === 'done')
  const ready = Boolean(base && head && base !== head)
  const comparison = useQuery('compare', ready && base && head ? { base, head } : null)
  const budgets = useQuery('budgets.check', head ? { scanId: head } : null)
  const headSummary = useQuery('scans.summary', head ? { scanId: head } : null)
  const [tab, setTab] = useState<Tab>('new')
  const tabsRef = useRef<HTMLDivElement>(null)
  const host = site ? hostOf(site.origin) : null
  useDocumentTitle(host ? `Compare · ${host}` : 'Compare')

  useEffect(() => {
    if (!done || siteId === null || (base && head))
      return
    const nextHead = head ?? done[0]?.id ?? null
    const nextBase = base ?? done.find(s => s.id !== nextHead)?.id ?? null
    if (nextHead && nextBase)
      navigate(routeHref({ name: 'compare', siteId, base: nextBase, head: nextHead }), { replace: true })
  }, [done, siteId, base, head])

  useEffect(() => {
    if (siteId === null && sites.data?.length === 1 && sites.data[0])
      navigate(routeHref({ name: 'compare', siteId: sites.data[0].id, base: null, head: null }), { replace: true })
  }, [siteId, sites.data])

  const set = (next: { siteId?: number | null, base?: string | null, head?: string | null }) =>
    navigate(routeHref({ name: 'compare', siteId: next.siteId !== undefined ? next.siteId : siteId, base: next.base !== undefined ? next.base : base, head: next.head !== undefined ? next.head : head }), { replace: true })

  const crumbs = host && siteId !== null ? [{ label: host, href: routeHref({ name: 'site', siteId }) }, { label: 'Compare' }] : [{ label: 'Home', href: href('/') }, { label: 'Compare' }]

  const pickers = (
    <div className="pickers">
      {!site && (
        <Picker label="Site" value="" onChange={value => set({ siteId: value ? Number(value) : null, base: null, head: null })}>
          <option value="">Choose a site</option>
          {sites.data?.map(s => <option key={s.id} value={s.id}>{hostOf(s.origin)}</option>)}
        </Picker>
      )}
      {site && (
        <>
          <Picker label="Base scan" value={base ?? ''} onChange={value => set({ base: value || null })} disabled={!done}>
            <option value="">Base</option>
            {done?.map(s => <option key={s.id} value={s.id} disabled={s.id === head}>{scanOption(s, siteScans.numberOf(s.id))}</option>)}
          </Picker>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="muted"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
          <Picker label="Head scan" value={head ?? ''} onChange={value => set({ head: value || null })} disabled={!done}>
            <option value="">Head</option>
            {done?.map(s => <option key={s.id} value={s.id} disabled={s.id === base}>{scanOption(s, siteScans.numberOf(s.id))}</option>)}
          </Picker>
        </>
      )}
    </div>
  )

  const data = comparison.data
  let body
  if (sites.error)
    body = <ErrorState error={sites.error} onRetry={sites.reload} />
  else if (comparison.error)
    body = <ErrorState error={comparison.error} onRetry={comparison.reload} />
  else if (!site)
    body = sites.data ? <EmptyState title="Choose a site" compact /> : <div className="pad"><Skeleton lines={4} height={44} /></div>
  else if (!ready)
    body = done && done.length < 2 ? <EmptyState title="Two scans needed" compact /> : <EmptyState title="Choose two scans" compact />
  else if (!data)
    body = <div className="pad"><Skeleton lines={6} height={44} /></div>
  else {
    const real = (list: IssueDiff[]) => list.filter(issue => !SITE_CHECK_IDS.has(issue.auditId))
    const created = real(data.issues.new)
    const fixed = real(data.issues.fixed)
    const persisting = real(data.issues.persisting)
    const regressed = persisting.filter(issue => issue.pagesDelta > 0)
    const unchanged = persisting.length - regressed.length
    const baseIssues = fixed.length + persisting.length + real(data.issues.unknown).length
    const headIssues = created.length + persisting.length
    const groups: Record<Tab, IssueDiff[]> = { new: created, regressed, fixed }
    const failed = budgets.data?.results.find(result => !result.passed && !result.skipped)
    const checked = budgets.data?.results.some(result => !result.skipped) ?? false
    const tabs: Tab[] = ['new', 'regressed', 'fixed']
    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      const index = tabs.indexOf(tab)
      const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length : event.key === 'ArrowLeft' ? (index + tabs.length - 1) % tabs.length : -1
      const target = tabs[next]
      if (!target)
        return
      event.preventDefault()
      setTab(target)
      requestAnimationFrame(() => tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${target}"]`)?.focus())
    }
    body = (
      <>
        <Hero
          title={`${formatCount(baseIssues)} → ${plural(headIssues, 'issue')}`}
          sub={`${formatCount(created.length)} new · ${formatCount(regressed.length)} regressed · ${formatCount(fixed.length)} fixed · ${formatCount(unchanged)} unchanged`}
          aside={checked && budgets.data && (
            <span className={`budget-chip${failed ? ' failed' : ' passed'}`}>
              <span className="budget-dot" aria-hidden="true" />
              {failed ? `Budget failed: ${budgetText(failed)}` : 'Budgets passed'}
            </span>
          )}
        />
        <section className="tiles" aria-label="Category change">
          {CATEGORIES.map((category) => {
            const deltas = data.devices.map(device => device.scores[category]?.delta).filter((value): value is number => value !== undefined)
            const delta = average(deltas)
            const noise = data.noise.scores[category]
            const points = delta === null ? 0 : Math.round(Math.abs(delta) * 100)
            const flat = delta === null || Math.abs(delta) < noise || points === 0
            const text = delta === null ? '' : flat ? `±${points} noise` : `${delta > 0 ? '+' : '−'}${points}`
            const median = categoryMedian(headSummary.data, category, null)
            return (
              <div key={category} className="tile static">
                <span className="text-2">{CATEGORY_LABELS[category]}</span>
                <span className="tile-value">
                  <span className={`tile-now num r-${scoreRating(median)}`}>{formatScore(median)}</span>
                  <span className={`num ${flat ? 'muted' : delta !== null && delta > 0 ? 'c-fixed' : 'c-new'}`}>{text}</span>
                </span>
              </div>
            )
          })}
        </section>
        <div className="tabs-row" role="tablist" aria-label="Change type" ref={tabsRef} onKeyDown={onKeyDown}>
          {tabs.map(id => (
            <button key={id} type="button" role="tab" data-tab={id} className="seg-tab" aria-selected={tab === id} tabIndex={tab === id ? 0 : -1} onClick={() => setTab(id)}>
              {`${id.charAt(0).toUpperCase()}${id.slice(1)} · ${formatCount(groups[id].length)}`}
            </button>
          ))}
        </div>
        <div role="tabpanel" aria-label={tab}>
          {groups[tab].length === 0 && <EmptyState title="None" compact />}
          {groups[tab].map(issue => (
            <Link key={issue.auditId} className="issue-row compare-row" to={routeHref({ name: 'issue', scanId: tab === 'fixed' ? data.base.id : data.head.id, auditId: issue.auditId })}>
              <span className="issue-row-main">
                <span className={`issue-title${tab === 'fixed' ? ' dim' : ''}`}>{issue.title}</span>
                <CategoryPill category={issue.category} />
              </span>
              <span className="issue-row-meta num">
                <span className="muted">{tab === 'new' ? '—' : plural(issue.basePages, 'page')}</span>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true" className="faint"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                <span className={`issue-pages ${tab === 'fixed' ? 'c-fixed' : 'c-new'}`}>{tab === 'fixed' ? '0' : plural(issue.headPages, 'page')}</span>
              </span>
            </Link>
          ))}
        </div>
      </>
    )
  }

  return (
    <>
      <TopBar crumbs={crumbs} actions={pickers} />
      {body}
    </>
  )
}
