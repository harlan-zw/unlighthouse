import { useEffect, useState } from 'react'
import { SITE_CHECK_IDS } from '../../analysis/summary.ts'
import type { IssueQuery } from '../../contracts.ts'
import { CATEGORIES, DEVICES, type Category, type Device, type Issue } from '../../types.ts'
import { EmptyState, ErrorState, ScanPill, Skeleton } from '../components/controls.tsx'
import { CategoryPill, firstTemplate, itemSummary, LabTag, SeverityIcon, TemplateTag } from '../components/issues.tsx'
import { Hero, TopBar } from '../components/layout.tsx'
import { CATEGORY_LABELS, formatCount, formatScore, hostOf, plural, scoreRating } from '../format.ts'
import { useClient, useDocumentTitle, useQuery } from '../hooks.ts'
import { useRestart } from '../restart.ts'
import { Link, routeHref, useSearchParams } from '../router.tsx'
import { categoryMedian } from '../scores.ts'
import { useScope } from '../scope.tsx'

type Sort = 'impact' | 'pages' | 'title'

const SORTS: Array<{ id: Sort, label: string }> = [
  { id: 'impact', label: 'Impact ↓' },
  { id: 'pages', label: 'Pages ↓' },
  { id: 'title', label: 'Title A–Z' },
]

function sortIssues(list: Issue[], sort: Sort): Issue[] {
  if (sort === 'impact')
    return list
  if (sort === 'pages')
    return list.toSorted((a, b) => b.pages - a.pages || b.impact - a.impact)
  return list.toSorted((a, b) => a.title.localeCompare(b.title, 'en'))
}

const PAGE = 500

function useAllIssues(input: IssueQuery | null, refresh: number): { data: Issue[] | undefined, error: Error | null, loading: boolean, reload: () => void } {
  const client = useClient()
  const key = input ? JSON.stringify(input) : null
  const [state, setState] = useState<{ key: string | null, data: Issue[] | undefined, error: Error | null, loading: boolean }>({ key: null, data: undefined, error: null, loading: false })
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (!key || !input)
      return
    let cancelled = false
    setState(prev => ({ ...prev, loading: true, error: null }))
    void (async () => {
      const items: Issue[] = []
      let total = 0
      do {
        const page = await client.call('issues.list', { ...input, limit: PAGE, offset: items.length })
        items.push(...page.items)
        total = page.total
        if (page.items.length === 0)
          break
      } while (items.length < total)
      return items
    })().then(
      (data) => {
        if (!cancelled)
          setState({ key, data, error: null, loading: false })
      },
      (error: unknown) => {
        if (!cancelled)
          setState(prev => ({ ...prev, error: error instanceof Error ? error : new Error(String(error)), loading: false }))
      },
    )
    return () => {
      cancelled = true
    }
  }, [client, key, refresh, nonce])
  return { data: state.data, error: state.error, loading: state.loading, reload: () => setNonce(n => n + 1) }
}

export function IssuesPage() {
  const client = useClient()
  const { scan, summary, templates, siteScans, refresh, error } = useScope()
  const [params, setParams] = useSearchParams()
  const [sort, setSort] = useState<Sort>('impact')
  const category = CATEGORIES.find(c => c === params.get('category')) ?? null
  const device = DEVICES.find(d => d === params.get('device')) ?? null
  const template = params.get('template') ?? ''
  const { restart, busy, error: restartError } = useRestart(scan)

  const input: IssueQuery = { scanId: scan?.id ?? '', limit: PAGE, offset: 0 }
  if (device)
    input.device = device
  if (template)
    input.template = template
  const issues = useAllIssues(scan ? input : null, refresh)
  const baselineId = summary?.baseline?.scanId
  const comparison = useQuery('compare', scan && baselineId ? { base: baselineId, head: scan.id } : null, refresh)
  const fresh = new Set(comparison.data?.issues.new.map(issue => issue.auditId))

  const host = scan ? hostOf(scan.origin) : '…'
  useDocumentTitle(host === '…' ? 'Issues' : `Issues · ${host}`)

  if (error && !scan)
    return <ErrorState error={error} />
  if (!scan)
    return <><TopBar crumbs={[{ label: '…' }]} /><div className="pad"><Skeleton lines={6} height={44} /></div></>

  const all = issues.data?.filter(issue => !SITE_CHECK_IDS.has(issue.auditId)) ?? []
  const counts = new Map<Category, number>()
  for (const issue of all) {
    if (issue.category)
      counts.set(issue.category, (counts.get(issue.category) ?? 0) + 1)
  }
  const rows = sortIssues(category ? all.filter(issue => issue.category === category) : all, sort)
  const baseline = summary?.baseline
  const prev = baseline ? siteScans.numberOf(baseline.scanId) : null
  const prevLabel = prev ? `#${prev}` : 'previous'

  return (
    <>
      <TopBar
        crumbs={[{ label: host, href: routeHref({ name: 'site', siteId: scan.siteId }) }, { label: 'Issues' }]}
        status={<ScanPill status={scan.status} />}
        actions={(
          <>
            {baseline && <Link className="btn" to={routeHref({ name: 'compare', siteId: scan.siteId, base: baseline.scanId, head: scan.id })}>{`Compare with ${prevLabel}`}</Link>}
            {client.mode !== 'static' && <button type="button" className="btn btn-primary" onClick={() => void restart()} disabled={busy}>Rescan</button>}
          </>
        )}
      />
      {restartError && <p className="field-error pad-x" role="alert">{restartError}</p>}
      <Hero
        title={summary ? plural(summary.issueCount, 'issue') : '—'}
        sub={summary ? [`${plural(summary.findingCount, 'finding')}`, plural(summary.pages.discovered, 'page'), templates ? plural(templates.length, 'template') : null].filter(Boolean).join(' · ') : undefined}
        aside={baseline && (
          <Link className="hero-delta" to={routeHref({ name: 'compare', siteId: scan.siteId, base: baseline.scanId, head: scan.id })}>
            {baseline.issues.new > 0 && <span className="c-new">{`+${formatCount(baseline.issues.new)} new`}</span>}
            {baseline.issues.fixed > 0 && <span className="c-fixed">{`${formatCount(baseline.issues.fixed)} fixed`}</span>}
            <span>{`since ${prevLabel}`}</span>
          </Link>
        )}
      />
      {scan.status === 'failed' && scan.error && <p className="scan-error mono" role="alert">{scan.error}</p>}
      <section className="tiles" aria-label="Categories">
        {CATEGORIES.map((c) => {
          const median = categoryMedian(summary, c, device)
          const on = category === c
          return (
            <button key={c} type="button" className="tile" aria-pressed={on} onClick={() => setParams({ category: on ? null : c })}>
              <span className="tile-head">
                <span className="text-2">{CATEGORY_LABELS[c]}</span>
                {c === 'performance' && <LabTag summary={summary} />}
              </span>
              <span className="tile-value">
                <span className={`tile-score num r-${scoreRating(median)}`}>{formatScore(median)}</span>
                <span className="muted">{plural(counts.get(c) ?? 0, 'issue')}</span>
              </span>
            </button>
          )
        })}
      </section>
      <section aria-label="Issues">
        <div className="filters">
          <div className="chips">
            <label className={`chip-select${category ? ' set' : ''}`}>
              <span className="sr-only">Category</span>
              <select value={category ?? ''} onChange={event => setParams({ category: event.target.value || null })}>
                <option value="">All categories</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </label>
            <label className={`chip-select${template ? ' set' : ''}`}>
              <span className="sr-only">Template</span>
              <select value={template} onChange={event => setParams({ template: event.target.value || null })}>
                <option value="">+ Template</option>
                {template && !templates?.some(t => t.template === template) && <option value={template}>{template}</option>}
                {templates?.map(t => <option key={t.template} value={t.template}>{t.template}</option>)}
              </select>
            </label>
            {scan.devices.length > 1 && (
              <label className={`chip-select${device ? ' set' : ''}`}>
                <span className="sr-only">Device</span>
                <select value={device ?? ''} onChange={event => setParams({ device: event.target.value || null })}>
                  <option value="">+ Device</option>
                  {scan.devices.map((d: Device) => <option key={d} value={d}>{d === 'mobile' ? 'Mobile' : 'Desktop'}</option>)}
                </select>
              </label>
            )}
          </div>
          <button type="button" className="sort-chip" onClick={() => setSort(SORTS[(SORTS.findIndex(entry => entry.id === sort) + 1) % SORTS.length]?.id ?? 'impact')} aria-label={`Sort: ${SORTS.find(entry => entry.id === sort)?.label ?? ''}`}>
            {SORTS.find(entry => entry.id === sort)?.label}
          </button>
        </div>
        {issues.error && <ErrorState error={issues.error} onRetry={issues.reload} compact />}
        {!issues.data && !issues.error && <div className="pad"><Skeleton lines={6} height={36} /></div>}
        {issues.data && rows.length === 0 && <EmptyState title="No issues" compact />}
        {rows.length > 0 && (
          <div role="list">
            {rows.map(issue => (
              <Link key={issue.auditId} role="listitem" className="issue-row" to={routeHref({ name: 'issue', scanId: scan.id, auditId: issue.auditId })}>
                <SeverityIcon severity={issue.severity} />
                <span className="issue-row-main">
                  <span className="issue-title">{issue.title}</span>
                  <span className="muted issue-items truncate">{itemSummary(issue)}</span>
                  {fresh.has(issue.auditId) && <span className="new-tag">new</span>}
                </span>
                <span className="issue-row-meta">
                  <TemplateTag>{firstTemplate(issue, templates)}</TemplateTag>
                  <CategoryPill category={issue.category} />
                  <span className="issue-pages num">{plural(issue.pages, 'page')}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </>
  )
}
