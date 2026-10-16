import { useEffect } from 'react'
import type { IssueDiff, PageDiff, ScanComparison, TemplateDelta } from '../../analysis/compare.ts'
import { CATEGORIES, type Scan } from '../../types.ts'
import { useDocumentTitle, useQuery } from '../hooks.ts'
import { CATEGORY_LABELS, CATEGORY_SHORT, formatCount, formatDate, formatMetric, formatScore, hostOf, pathOf } from '../format.ts'
import { href, Link, navigate, routeHref } from '../router.tsx'
import { DeviceLabel, EmptyState, ErrorState, SeverityBadge, Skeleton } from '../components/controls.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'
import { Card, PageHead, useBreadcrumbs } from '../components/layout.tsx'
import { Delta, Score } from '../components/score.tsx'
import { scanName } from './Site.tsx'

function scanOption(scan: Scan): string {
  const git = scan.branch ? ` · ${scan.branch}${scan.commit ? `@${scan.commit.slice(0, 7)}` : ''}` : ''
  return `${formatDate(scan.createdAt)} — ${scanName(scan)}${git}`
}

function ScoresDiff({ data }: { data: ScanComparison }) {
  return (
    <Card title="Mean scores" hint="Pages measured in both scans; grey changes are within noise">
      <div className="stack">
        {data.devices.map(d => (
          <div key={d.device} className="compare-device">
            <DeviceLabel device={d.device} />
            <div className="compare-cats">
              {CATEGORIES.map((category) => {
                const value = d.scores[category]
                return (
                  <div key={category} className="compare-cat" title={`Noise threshold ±${Math.round(data.noise.scores[category] * 100)} points`}>
                    <span className="compare-cat-label">{CATEGORY_LABELS[category]}</span>
                    <span className="compare-cat-values">
                      <span className="from">{formatScore(value?.base)}</span>
                      <span className="faint" aria-hidden="true">→</span>
                      <span className="sr-only">to</span>
                      <Score score={value?.head ?? null} label={CATEGORY_LABELS[category]} />
                      <Delta value={value?.delta ?? null} noise={data.noise.scores[category]} />
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
        {data.devices.length === 0 && <EmptyState title="No pages in common" compact>These scans share no measured page and device.</EmptyState>}
      </div>
    </Card>
  )
}

function pageColumns(scanId: string): Column<PageDiff>[] {
  return [
    {
      key: 'url',
      header: 'Page',
      className: 'cell-url',
      sortValue: p => p.url,
      render: p => (
        <span className="url-cell">
          <Link className="url-path" to={routeHref({ name: 'page', scanId, url: p.url, device: p.device })} title={p.url}>{pathOf(p.url)}</Link>
          <span className="cell-sub mono">{`${p.template} · ${p.device}`}</span>
        </span>
      ),
    },
        {
      key: 'performance',
      header: 'Performance',
      align: 'right',
      sortValue: p => p.scores.performance?.delta ?? 0,
      render: (p) => {
        const perf = p.scores.performance
        if (!perf)
          return <span className="faint">—</span>
        return (
          <span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
            <span className="faint num hide-sm">{formatScore(perf.base)}</span>
            <span className="faint hide-sm" aria-hidden="true">→</span>
            <Score score={perf.head} label="Performance" />
            <span style={{ minWidth: 44, display: 'inline-flex', justifyContent: 'flex-end' }}><Delta value={perf.delta} change={perf.change} /></span>
          </span>
        )
      },
    },
    {
      key: 'lcp',
      header: 'LCP',
      title: 'Largest Contentful Paint',
      align: 'right',
      hideBelow: 'sm',
      sortValue: p => p.metrics.lcp?.delta ?? 0,
      render: (p) => {
        const lcp = p.metrics.lcp
        return lcp
          ? <span title={`${formatMetric('lcp', lcp.base)} → ${formatMetric('lcp', lcp.head)}`}><Delta value={lcp.delta} kind="ms" change={lcp.change} /></span>
          : <span className="faint">—</span>
      },
    },
    ...(['accessibility', 'best-practices', 'seo', 'agentic-browsing'] as const).map(category => ({
      key: category,
      header: CATEGORY_SHORT[category],
      title: CATEGORY_LABELS[category],
      align: 'right' as const,
      hideBelow: 'md' as const,
      sortValue: (p: PageDiff) => p.scores[category]?.delta ?? 0,
      render: (p: PageDiff) => {
        const value = p.scores[category]
        return value ? <Delta value={value.delta} change={value.change} /> : <span className="faint">—</span>
      },
    })),
  ]
}

function issueColumns(): Column<IssueDiff>[] {
  return [
    { key: 'severity', header: <span className="sr-only">Severity</span>, render: i => <SeverityBadge severity={i.severity} /> },
    {
      key: 'title',
      header: 'Issue',
      className: 'cell-title',
      sortValue: i => i.title,
      render: i => (
        <span className="url-cell">
          <span style={{ fontWeight: 500 }}>{i.title}</span>
          {i.items > 1 && <span className="cell-sub">{`${formatCount(i.items)} resources`}</span>}
        </span>
      ),
    },
    { key: 'pages', header: 'Pages', align: 'right', sortValue: i => Math.max(i.basePages, i.headPages), defaultOrder: 'desc', render: i => <span className="num">{formatCount(Math.max(i.basePages, i.headPages))}</span> },
    { key: 'impact', header: 'Impact', align: 'right', hideBelow: 'sm', sortValue: i => i.impact, defaultOrder: 'desc', render: i => <span className="num">{formatCount(i.impact)}</span> },
  ]
}

function templateColumns(noise: number): Column<TemplateDelta>[] {
  return [
    { key: 'template', header: 'Template', sortValue: t => t.template, render: t => <span className="url-cell"><span className="mono">{t.template}</span><span className="cell-sub show-sm">{t.device}</span></span> },
    { key: 'device', header: 'Device', hideBelow: 'sm', sortValue: t => t.device, render: t => <span className="muted">{t.device}</span> },
    { key: 'pages', header: 'Pages', align: 'right', hideBelow: 'sm', sortValue: t => t.pages, render: t => <span className="num">{t.pages}</span> },
    {
      key: 'performance',
      header: 'Mean performance',
      align: 'right',
      sortValue: t => t.delta,
      render: t => (
        <span className="row" style={{ justifyContent: 'flex-end', flexWrap: 'nowrap' }}>
          <span className="faint num hide-sm">{formatScore(t.base)}</span>
          <span className="faint hide-sm" aria-hidden="true">→</span>
          <Score score={t.head} label="Mean performance" />
          <span style={{ minWidth: 44, display: 'inline-flex', justifyContent: 'flex-end' }}><Delta value={t.delta} noise={noise} /></span>
        </span>
      ),
    },
  ]
}

function ComparisonView({ data }: { data: ScanComparison }) {
  const regressed = data.pages.filter(p => p.status === 'regressed')
  const improved = data.pages.filter(p => p.status === 'improved')
  const columns = pageColumns(data.head.id)
  const { totals } = data
  return (
    <div className="stack">
      <div className="stat-grid">
        <div className="stat"><span className="stat-label">Regressed</span><span className="stat-value" style={totals.pages.regressed ? { color: 'var(--poor)' } : undefined}>{formatCount(totals.pages.regressed)}</span><span className="stat-sub">pages</span></div>
        <div className="stat"><span className="stat-label">Improved</span><span className="stat-value" style={totals.pages.improved ? { color: 'var(--good)' } : undefined}>{formatCount(totals.pages.improved)}</span><span className="stat-sub">pages</span></div>
        <div className="stat"><span className="stat-label">Unchanged</span><span className="stat-value">{formatCount(totals.pages.unchanged)}</span><span className="stat-sub">within noise</span></div>
        <div className="stat"><span className="stat-label">Added / removed</span><span className="stat-value">{`${formatCount(totals.pages.added)} / ${formatCount(totals.pages.removed)}`}</span><span className="stat-sub">pages</span></div>
        <div className="stat"><span className="stat-label">Now failing</span><span className="stat-value" style={totals.pages.failed ? { color: 'var(--poor)' } : undefined}>{formatCount(totals.pages.failed)}</span><span className="stat-sub">pages measured before</span></div>
        <div className="stat"><span className="stat-label">Issues</span><span className="stat-value">{`+${formatCount(totals.issues.new)} / −${formatCount(totals.issues.fixed)}`}</span><span className="stat-sub">{`new / fixed · ${formatCount(totals.issues.persisting)} persisting`}</span></div>
      </div>
      <ScoresDiff data={data} />
      <Card title="Templates" hint="Mean performance change, worst first" flush>
        <DataTable caption="Template changes" columns={templateColumns(data.noise.scores.performance)} rows={data.templates} rowKey={t => `${t.template}|${t.device}`} defaultSort={{ key: 'performance', order: 'asc' }} maxHeight="360px" dense empty={<EmptyState title="No templates in common" compact />} />
      </Card>
      <Card title="Regressed pages" hint={formatCount(regressed.length)} flush>
        <DataTable caption="Regressed pages" columns={columns} rows={regressed} rowKey={p => `${p.url}|${p.device}`} defaultSort={{ key: 'performance', order: 'asc' }} maxHeight="420px" dense empty={<EmptyState title="No regressions beyond noise" compact />} />
      </Card>
      <Card title="Improved pages" hint={formatCount(improved.length)} flush>
        <DataTable caption="Improved pages" columns={columns} rows={improved} rowKey={p => `${p.url}|${p.device}`} defaultSort={{ key: 'performance', order: 'desc' }} maxHeight="420px" dense empty={<EmptyState title="No improvements beyond noise" compact />} />
      </Card>
      <div className="grid-2">
        <Card title="New issues" hint={formatCount(data.issues.new.length)} flush>
          <DataTable caption="New issues" columns={issueColumns()} rows={data.issues.new} rowKey={i => i.auditId} defaultSort={{ key: 'impact', order: 'desc' }} maxHeight="420px" dense empty={<EmptyState title="No new issues" compact />} />
        </Card>
        <Card title="Fixed issues" hint={formatCount(data.issues.fixed.length)} flush>
          <DataTable caption="Fixed issues" columns={issueColumns()} rows={data.issues.fixed} rowKey={i => i.auditId} defaultSort={{ key: 'impact', order: 'desc' }} maxHeight="420px" dense empty={<EmptyState title="No fixed issues" compact />} />
        </Card>
      </div>
    </div>
  )
}

export function ComparePage({ siteId, base, head }: { siteId: number | null, base: string | null, head: string | null }) {
  const sites = useQuery('sites.list', {})
  const site = siteId === null ? undefined : sites.data?.find(s => s.id === siteId)
  const scans = useQuery('scans.list', site ? { origin: site.origin, status: 'done', limit: 100, offset: 0 } : null)
  const ready = Boolean(base && head && base !== head)
  const comparison = useQuery('compare', ready && base && head ? { base, head } : null)
  const host = site ? hostOf(site.origin) : null

  useBreadcrumbs([{ label: 'Sites', href: href('/') }, ...(host && site ? [{ label: host, href: routeHref({ name: 'site', siteId: site.id }) }] : []), { label: 'Compare' }])
  useDocumentTitle(host ? `Compare · ${host}` : 'Compare')

  const items = scans.data?.items
  useEffect(() => {
    if (!items || siteId === null || (base && head))
      return
    const nextHead = head ?? items[0]?.id ?? null
    const nextBase = base ?? items.find(s => s.id !== nextHead)?.id ?? null
    if (nextHead && nextBase)
      navigate(routeHref({ name: 'compare', siteId, base: nextBase, head: nextHead }), { replace: true })
  }, [items, siteId, base, head])

  useEffect(() => {
    if (siteId === null && sites.data?.length === 1 && sites.data[0])
      navigate(routeHref({ name: 'compare', siteId: sites.data[0].id, base: null, head: null }), { replace: true })
  }, [siteId, sites.data])

  const set = (next: { siteId?: number | null, base?: string | null, head?: string | null }) =>
    navigate(routeHref({ name: 'compare', siteId: next.siteId !== undefined ? next.siteId : siteId, base: next.base !== undefined ? next.base : base, head: next.head !== undefined ? next.head : head }), { replace: true })

  return (
    <div className="stack">
      <PageHead
        eyebrow={host ?? 'Compare'}
        title="Compare scans"
        meta={comparison.data && <span>{`${scanName(comparison.data.base)} → ${scanName(comparison.data.head)}`}</span>}
      />
      <Card>
        <div className="stack-sm">
          {sites.error && <ErrorState error={sites.error} onRetry={sites.reload} compact />}
          <label className="field" style={{ maxWidth: 360 }}>
            <span>Site</span>
            <select className="select" value={siteId ?? ''} onChange={event => set({ siteId: event.target.value ? Number(event.target.value) : null, base: null, head: null })}>
              <option value="">Choose a site…</option>
              {sites.data?.map(s => <option key={s.id} value={s.id}>{hostOf(s.origin)}</option>)}
            </select>
          </label>
          {site && (
            <div className="compare-pickers">
              <label className="field">
                <span>Base (before)</span>
                <select className="select" value={base ?? ''} onChange={event => set({ base: event.target.value || null })} disabled={!items}>
                  <option value="">Choose a scan…</option>
                  {items?.map(s => <option key={s.id} value={s.id} disabled={s.id === head}>{scanOption(s)}</option>)}
                </select>
              </label>
              <span className="compare-arrow" aria-hidden="true">→</span>
              <label className="field">
                <span>Head (after)</span>
                <select className="select" value={head ?? ''} onChange={event => set({ head: event.target.value || null })} disabled={!items}>
                  <option value="">Choose a scan…</option>
                  {items?.map(s => <option key={s.id} value={s.id} disabled={s.id === base}>{scanOption(s)}</option>)}
                </select>
              </label>
            </div>
          )}
          {site && items && items.length < 2 && <p className="muted">This site needs at least two finished scans to compare.</p>}
        </div>
      </Card>
      {!site && sites.data && <EmptyState title="Pick a site">Choose the site whose scans you want to compare.</EmptyState>}
      {site && !ready && items && items.length >= 2 && <EmptyState title="Pick two different scans" />}
      {comparison.error && <ErrorState error={comparison.error} onRetry={comparison.reload} />}
      {ready && !comparison.data && !comparison.error && <Skeleton lines={6} />}
      {ready && comparison.data && <ComparisonView data={comparison.data} />}
    </div>
  )
}
