import { CATEGORIES, METRICS, type Category, type Device, type Finding } from '../../types.ts'
import { useClient, useDocumentTitle, useQuery } from '../hooks.ts'
import { CATEGORY_LABELS, formatBytes, formatCount, formatDate, formatDuration, formatMs, hostOf, METRIC_LABELS } from '../format.ts'
import { href, navigate, routeHref } from '../router.tsx'
import { DeviceToggle, EmptyState, ErrorState, SeverityBadge, Skeleton, StatusBadge } from '../components/controls.tsx'
import { Callout, Card, PageHead, useBreadcrumbs } from '../components/layout.tsx'
import { MetricValue, ScoreRing } from '../components/score.tsx'
import type { PageDetail } from '../shapes.ts'
import { scanName } from './Site.tsx'

const SPREAD_LIMIT = 0.1
const BENCHMARK_MIN = 1000

function reliability(page: PageDetail): string[] {
  const p = page.provenance
  if (!p)
    return []
  const notes: string[] = []
  if (p.spread !== null && p.spread > SPREAD_LIMIT)
    notes.push(`Performance varied by ${Math.round(p.spread * 100)} points across ${p.samples} samples; treat single-run differences below that as noise.`)
  if (p.samples === 1)
    notes.push('Measured once. Run with samples ≥ 3 for a stable median.')
  if (p.benchmarkIndex !== null && p.benchmarkIndex < BENCHMARK_MIN)
    notes.push(`Benchmark index ${p.benchmarkIndex} is below ${BENCHMARK_MIN}: the machine was slow, so performance reads lower than on typical hardware.`)
  if (p.throttling === 'simulate' && p.concurrency > 2)
    notes.push(`${p.concurrency} audits ran in parallel; CPU contention can skew simulated throttling.`)
  for (const warning of p.warnings) {
    if (!notes.some(n => n.startsWith(warning.slice(0, 24))))
      notes.push(warning)
  }
  return [...new Set(notes)]
}

function Findings({ findings }: { findings: Finding[] }) {
  if (findings.length === 0)
    return <EmptyState title="No failing audits" compact>Every audit on this page passed.</EmptyState>
  const groups = new Map<Category | 'other', Finding[]>()
  for (const finding of findings) {
    const key = finding.category ?? 'other'
    groups.set(key, [...(groups.get(key) ?? []), finding])
  }
  const order: Array<Category | 'other'> = [...CATEGORIES, 'other']
  return (
    <div>
      {order.filter(key => groups.has(key)).map((key) => {
        const list = [...(groups.get(key) ?? [])].sort((a, b) => (a.severity === b.severity ? (b.savingsMs ?? 0) - (a.savingsMs ?? 0) : a.severity === 'fail' ? -1 : 1))
        return (
          <section key={key} className="finding-group" aria-labelledby={`fg-${key}`}>
            <div className="finding-group-head">
              <h3 id={`fg-${key}`}>{key === 'other' ? 'Other' : CATEGORY_LABELS[key]}</h3>
              <span className="faint num" style={{ fontSize: 'var(--text-sm)' }}>{`${list.length} ${list.length === 1 ? 'finding' : 'findings'}`}</span>
            </div>
            <ul className="findings">
              {list.map(finding => (
                <li key={`${finding.auditId}|${finding.itemKey}`}>
                  <SeverityBadge severity={finding.severity} />
                  <div style={{ minWidth: 0 }}>
                    <div className="finding-title">{finding.title}</div>
                    {(finding.itemLabel || finding.itemKey) && <div className="finding-item" title={finding.itemKey}>{finding.itemLabel ?? finding.itemKey}</div>}
                  </div>
                  <div className="finding-meta">
                    {finding.savingsMs || finding.savingsBytes
                      ? [finding.savingsMs ? formatMs(finding.savingsMs) : null, finding.savingsBytes ? formatBytes(finding.savingsBytes) : null].filter(Boolean).join(' · ')
                      : finding.displayValue ?? ''}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export function PageDetailPage({ scanId, url, device }: { scanId: string, url: string, device: Device }) {
  const client = useClient()
  const scan = useQuery('scans.get', { scanId })
  const page = useQuery('pages.get', { scanId, url, device })
  const data = page.data
  const host = scan.data ? hostOf(scan.data.origin) : '…'
  useBreadcrumbs([
    { label: 'Sites', href: href('/') },
    ...(scan.data ? [{ label: host, href: routeHref({ name: 'site', siteId: scan.data.siteId }) }, { label: scanName(scan.data), href: routeHref({ name: 'scan', scanId, tab: 'pages' }) }] : []),
    { label: data?.path ?? 'Page' },
  ])
  useDocumentTitle(data ? `${data.path} · ${device}` : 'Page')

  if (page.error)
    return <ErrorState error={page.error} onRetry={page.reload} />
  if (!data)
    return <div className="stack"><Skeleton lines={2} height={28} /><Skeleton lines={6} /></div>

  const notes = reliability(data)
  const report = data.status === 'done' ? client.reportUrl(scanId, device, url) : null
  const p = data.provenance
  const devices = scan.data?.devices ?? [device]

  return (
    <div className="stack">
      <PageHead
        eyebrow={<span className="mono" style={{ textTransform: 'none', letterSpacing: 0 }}>{data.template}</span>}
        title={<span className="mono title-url">{data.path}</span>}
        meta={(
          <>
            <StatusBadge status={data.status} />
            <a className="link" href={data.url} target="_blank" rel="noreferrer" style={{ overflowWrap: 'anywhere' }}>{data.url}</a>
            {data.finishedAt && <span>{formatDate(data.finishedAt)}</span>}
          </>
        )}
        actions={(
          <>
            {devices.length > 1 && <DeviceToggle value={device} devices={devices} onChange={next => navigate(routeHref({ name: 'page', scanId, url, device: next }), { replace: true })} />}
            {report && (
              <a className="btn btn-primary" href={report} target="_blank" rel="noreferrer">
                Lighthouse report
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M6 3H3v10h10v-3M9 3h4v4M13 3 7.5 8.5" /></svg>
              </a>
            )}
          </>
        )}
      />
      {data.status === 'failed' && <Callout tone="poor" title="Audit failed">{data.error ?? 'Lighthouse could not audit this page.'}</Callout>}
      {data.status === 'skipped' && (
        <EmptyState title="Not audited">
          {`Sampling audited other pages of the ${data.template} template instead. Set sampling.perTemplate to 0 to audit every page.`}
        </EmptyState>
      )}
      {(data.status === 'queued' || data.status === 'running') && <EmptyState title="Waiting for audit">This page is still in the queue.</EmptyState>}
      {data.status === 'done' && (
        <>
          {notes.length > 0 && (
            <Callout tone="average" title="Reliability">
              <ul>{notes.map(n => <li key={n}>{n}</li>)}</ul>
            </Callout>
          )}
          <Card title="Scores">
            <div className="ring-row">
              {CATEGORIES.map(category => <ScoreRing key={category} score={data.scores[category]} label={CATEGORY_LABELS[category]} size={72} />)}
            </div>
          </Card>
          <div className="grid-main-side">
            <Card title="Lab metrics" hint={`${device === 'mobile' ? 'Mobile' : 'Desktop'}${p ? `, ${p.throttling} throttling` : ''}`}>
              <div className="metric-grid">
                {METRICS.map(metric => (
                  <div key={metric} className="metric-tile">
                    <span className="stat-label">{METRIC_LABELS[metric]}</span>
                    <MetricValue metric={metric} value={data.metrics[metric]} device={device} />
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Provenance">
              {p
                ? (
                    <dl className="kv">
                      <dt>Lighthouse</dt>
                      <dd className="num">{p.lighthouseVersion}</dd>
                      <dt>Benchmark index</dt>
                      <dd className="num">
                        {p.benchmarkIndex === null ? '—' : formatCount(p.benchmarkIndex)}
                        {p.benchmarkIndex !== null && p.benchmarkIndex < BENCHMARK_MIN && <span className="r-average">{' · slow host'}</span>}
                      </dd>
                      <dt>Throttling</dt>
                      <dd>{p.throttling}</dd>
                      <dt>Concurrency</dt>
                      <dd className="num">{p.concurrency}</dd>
                      <dt>Samples</dt>
                      <dd className="num">
                        {p.samples}
                        {p.spread !== null && <span className={p.spread > SPREAD_LIMIT ? 'r-average' : 'faint'}>{` · spread ${Math.round(p.spread * 100)} pts`}</span>}
                      </dd>
                      <dt>Duration</dt>
                      <dd className="num">{formatDuration(data.durationMs)}</dd>
                      <dt>HTTP status</dt>
                      <dd className="num">{data.statusCode ?? '—'}</dd>
                      {data.finalUrl && data.finalUrl !== data.url && (
                        <>
                          <dt>Final URL</dt>
                          <dd className="mono">{data.finalUrl}</dd>
                        </>
                      )}
                    </dl>
                  )
                : <span className="faint">Not recorded</span>}
            </Card>
          </div>
          <Card title="Findings" hint={`${data.findings.length} failing or warning audits`} flush>
            <Findings findings={data.findings} />
          </Card>
        </>
      )}
    </div>
  )
}
