import { DEFAULT_NOISE } from '../../analysis/compare.ts'
import type { DeviceSummary, ScanSummary, SiteCheckStatus, TemplateBrief } from '../../analysis/summary.ts'
import { describeWarning, SITE_CHECKS } from '../../analysis/summary.ts'
import { CATEGORIES, METRICS, type Category, type Device, type Scan } from '../../types.ts'
import { useQuery } from '../hooks.ts'
import { CATEGORY_LABELS, formatCount, formatPercent, formatRelative, METRIC_LABELS, METRIC_SHORT } from '../format.ts'
import { href, Link, navigate, routeHref } from '../router.tsx'
import { DeviceLabel, EmptyState, ErrorState, Skeleton } from '../components/controls.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'
import { Callout, Card, Stat } from '../components/layout.tsx'
import { Delta, MetricValue, ScoreBar, ScoreRing } from '../components/score.tsx'

const CHECK_ICONS: Record<SiteCheckStatus, { label: string, path: string, tone: string }> = {
  'pass': { label: 'Pass', path: 'm4 8.5 2.5 2.5L12 5.5', tone: 'pass' },
  'fail': { label: 'Fail', path: 'M5 5l6 6M11 5l-6 6', tone: 'fail' },
  'warn': { label: 'Warning', path: 'M8 4v5M8 11.5v.5', tone: 'warn' },
  'not-measured': { label: 'Not measured', path: 'M5 8h6', tone: 'na' },
}

function SiteChecks({ checks }: { checks: ScanSummary['siteChecks'] }) {
  return (
    <ul className="list">
      {SITE_CHECKS.map((check) => {
        const status = checks[check.auditId]
        const icon = CHECK_ICONS[status]
        return (
          <li key={check.auditId}>
            <span className={`check-status s-${icon.tone}`} title={icon.label}>
              <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d={icon.path} /></svg>
            </span>
            <div className="list-main">
              <span className="list-title" style={{ fontWeight: 500 }}>{check.title}</span>
              <span className="list-sub">{`${icon.label} · ${CATEGORY_LABELS[check.category]}`}</span>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function DeviceBlock({ device, deltas }: { device: DeviceSummary, deltas: Partial<Record<Category, number>> | undefined }) {
  const cwv = device.labCwvPass
  const done = device.pages.done ?? 0
  return (
    <div className="device-block">
      <div className="device-head">
        <h3><DeviceLabel device={device.device} /></h3>
        <span className="muted" style={{ fontSize: 'var(--text-sm)' }}>{`${formatCount(done)} audited pages`}</span>
      </div>
      <div className="ring-row">
        {CATEGORIES.map(category => (
          <div key={category} style={{ display: 'grid', justifyItems: 'center', gap: 2 }}>
            <ScoreRing score={device.scores.mean[category] ?? null} label={CATEGORY_LABELS[category]} size={60} />
            {deltas && <Delta value={deltas[category] ?? 0} noise={DEFAULT_NOISE.scores[category]} />}
          </div>
        ))}
      </div>
      {cwv && (
        <div className="cwv-row" title="Lab stand-in for Core Web Vitals: LCP and CLS at their good thresholds, TBT in place of INP">
          <span className="stat-label">Core Web Vitals pass (lab)</span>
          <strong className="num cwv-all">{formatPercent(cwv.all)}</strong>
          <span className="cwv-parts muted">
            <span className="num">{`LCP ${formatPercent(cwv.lcp)}`}</span>
            <span className="num">{`CLS ${formatPercent(cwv.cls)}`}</span>
            <span className="num">{`TBT ${formatPercent(cwv.tbtAsInpStandIn)}`}</span>
            <span className="faint">TBT stands in for INP</span>
          </span>
        </div>
      )}
      <div className="metric-grid">
        {METRICS.map(metric => (
          <div key={metric} className="metric-tile">
            <span className="stat-label" title={METRIC_LABELS[metric]}>{`${METRIC_SHORT[metric]} · p75`}</span>
            <MetricValue metric={metric} value={device.p75[metric] ?? null} device={device.device} />
          </div>
        ))}
      </div>
    </div>
  )
}

type TemplateRow = TemplateBrief & { device: Device }

export function ScanOverview({ scan, refresh }: { scan: Scan, refresh: number }) {
  const summary = useQuery('scans.summary', { scanId: scan.id }, refresh)
  if (summary.error)
    return <ErrorState error={summary.error} onRetry={summary.reload} />
  const data = summary.data
  if (!data)
    return <div className="stack"><Skeleton lines={2} height={64} /><Skeleton lines={6} /></div>

  const pagesPath = `/scans/${encodeURIComponent(scan.id)}/pages`
  const issuesHref = routeHref({ name: 'scan', scanId: scan.id, tab: 'issues' })
  const pageHref = (device: Device, path: string) => routeHref({ name: 'page', scanId: scan.id, url: scan.origin + path, device })
  const templates: TemplateRow[] = data.devices.flatMap(d => d.worstTemplates.map(t => ({ ...t, device: d.device })))
  const baseline = data.baseline

  const templateColumns: Column<TemplateRow>[] = [
    { key: 'template', header: 'Template', render: t => <span className="mono">{t.template}</span>, sortValue: t => t.template },
    { key: 'device', header: 'Device', render: t => <span title={t.device}><DeviceLabel device={t.device} /></span>, sortValue: t => t.device },
    { key: 'pages', header: 'Pages', align: 'right', hideBelow: 'sm', render: t => <span className="num">{t.pages}</span>, sortValue: t => t.pages },
    { key: 'performance', header: 'Performance', title: 'Mean performance score', render: t => <ScoreBar score={t.meanPerformance} label="Mean performance" />, sortValue: t => t.meanPerformance },
    {
      key: 'worst',
      header: 'Worst page',
      className: 'cell-url',
      hideBelow: 'sm',
      render: t => <Link className="url-path link" to={pageHref(t.device, t.worstPath)} title={t.worstPath}>{t.worstPath}</Link>,
    },
  ]

  return (
    <div className="stack">
      {data.warnings.length > 0 && (
        <Callout tone="average" title="Performance numbers may be unreliable">
          <ul>{data.warnings.map(w => <li key={w.code}>{describeWarning(w)}</li>)}</ul>
        </Callout>
      )}
      <div className="stat-grid">
        <Stat label="Discovered" value={formatCount(data.pages.discovered)} sub="unique URLs" />
        <Stat label="Audited" value={formatCount(data.pages.audited)} sub="unique URLs" />
        <Stat label="Skipped" value={formatCount(data.pages.skippedBySampling)} sub="left out by sampling" />
        <Stat label="Failed" value={<span style={data.pages.failed ? { color: 'var(--poor)' } : undefined}>{formatCount(data.pages.failed)}</span>} sub={data.pages.failed ? <Link className="link" to={href(pagesPath, { status: 'failed' })}>Show failed</Link> : 'none'} />
        <Stat label="Issues" value={formatCount(data.issueCount)} sub={<Link className="link" to={issuesHref}>Show issues</Link>} />
        <Stat label="Broken links" value={formatCount(data.brokenLinks)} sub={data.brokenLinks ? <Link className="link" to={routeHref({ name: 'scan', scanId: scan.id, tab: 'links' })}>Show links</Link> : 'none found'} />
      </div>
      <Card
        title="Scores"
        hint={baseline ? `Mean over audited pages · change vs. baseline ${formatRelative(baseline.createdAt)}` : 'Mean over audited pages'}
        actions={baseline && (
          <Link className="btn btn-sm" to={routeHref({ name: 'compare', siteId: scan.siteId, base: baseline.scanId, head: scan.id })}>Compare with baseline</Link>
        )}
      >
        {data.devices.every(d => !d.pages.done)
          ? <EmptyState title="No audited pages yet" compact>Scores appear as soon as the first page finishes.</EmptyState>
          : <div className="stack">{data.devices.map(device => <DeviceBlock key={device.device} device={device} deltas={baseline ? baseline.scores[device.device] ?? {} : undefined} />)}</div>}
        {baseline && (
          <p className="baseline-line muted">
            <span>{`${formatCount(baseline.pages.regressed)} pages regressed`}</span>
            <span>{`${formatCount(baseline.pages.improved)} improved`}</span>
            <span>{`${formatCount(baseline.issues.new)} new issues`}</span>
            <span>{`${formatCount(baseline.issues.fixed)} fixed`}</span>
          </p>
        )}
      </Card>
      <div className="grid-main-side">
        <Card title="Top issues" hint="Ranked by impact" flush actions={<Link className="btn btn-sm btn-ghost" to={issuesHref}>{`All ${formatCount(data.issueCount)} issues`}</Link>}>
          {data.topIssues.length === 0
            ? <EmptyState title="No issues found" compact />
            : (
                <ul className="list">
                  {data.topIssues.map((issue, i) => (
                    <li key={`${issue.auditId}|${issue.itemLabel ?? i}`}>
                      <span className="faint num" style={{ width: 16 }}>{i + 1}</span>
                      <div className="list-main">
                        <span className="list-title">{issue.title}</span>
                        <span className="list-sub mono">{issue.itemLabel ?? 'Page-level'}</span>
                      </div>
                      <div style={{ textAlign: 'right', fontSize: 'var(--text-sm)' }} className="nowrap">
                        <div className="num">{`${formatCount(issue.pages)} pages`}</div>
                        <div className="faint num">{`impact ${formatCount(issue.impact)}`}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
        </Card>
        <Card title="Site checks" hint="Once per origin" flush>
          <SiteChecks checks={data.siteChecks} />
        </Card>
      </div>
      <Card title="Worst templates" hint="Lowest mean performance per device" flush actions={<Link className="btn btn-sm btn-ghost" to={href(pagesPath)}>All pages</Link>}>
        <DataTable
          caption="Worst templates by mean performance"
          columns={templateColumns}
          rows={templates}
          rowKey={t => `${t.template}|${t.device}`}
          defaultSort={{ key: 'performance', order: 'asc' }}
          onRowActivate={t => navigate(href(pagesPath, { template: t.template, device: t.device }))}
          empty={<EmptyState title="No templates audited yet" compact />}
          dense
        />
      </Card>
    </div>
  )
}
