import { useState } from 'react'
import type { IssuePage, IssueQuery } from '../../contracts.ts'
import { CATEGORIES, type Category, type Device, type Issue, type Scan } from '../../types.ts'
import { useQuery } from '../hooks.ts'
import { CATEGORY_LABELS, formatBytes, formatCount, formatMs, pathOf } from '../format.ts'
import { Link, routeHref, useSearchParams } from '../router.tsx'
import { DeviceToggle, EmptyState, ErrorState, SeverityBadge, Spinner, TemplateFilter } from '../components/controls.tsx'
import { DataTable, type Column } from '../components/DataTable.tsx'

const LIMIT = 50

function issueKey(issue: Issue): string {
  return issue.auditId
}

function IssueDetail({ scanId, issue }: { scanId: string, issue: Issue }) {
  const detail = useQuery('issues.get', { scanId, auditId: issue.auditId })
  if (detail.error)
    return <ErrorState error={detail.error} onRetry={detail.reload} compact />
  if (!detail.data) {
    return (
      <div className="row muted" style={{ padding: 'var(--space-3) 0' }}>
        <Spinner />
        Loading affected pages…
      </div>
    )
  }
  const columns: Column<IssuePage>[] = [
    {
      key: 'url',
      header: 'Page',
      className: 'cell-url',
      sortValue: p => p.url,
      render: p => <Link className="url-path link" to={routeHref({ name: 'page', scanId, url: p.url, device: p.device })} title={p.url}>{pathOf(p.url)}</Link>,
    },
    { key: 'device', header: 'Device', sortValue: p => p.device, render: p => <span className="muted">{p.device}</span> },
    { key: 'template', header: 'Template', hideBelow: 'sm', sortValue: p => p.template, render: p => <span className="mono faint">{p.template}</span> },
    { key: 'value', header: 'Detail', hideBelow: 'md', render: p => <span className="muted">{p.displayValue ?? '—'}</span> },
    { key: 'ms', header: 'Savings', align: 'right', sortValue: p => p.savingsMs, defaultOrder: 'desc', render: p => <span className="num">{p.savingsMs ? formatMs(p.savingsMs) : '—'}</span> },
    { key: 'bytes', header: 'Bytes', align: 'right', hideBelow: 'sm', sortValue: p => p.savingsBytes, defaultOrder: 'desc', render: p => <span className="num">{formatBytes(p.savingsBytes)}</span> },
  ]
  return (
    <div className="issue-detail">
      <div className="issue-detail-meta">
        <span>
          {'Audit '}
          <code>{issue.auditId}</code>
        </span>
        {issue.items > 0 && <span>{`Resources: ${formatCount(issue.items)}`}</span>}
        <span>{`Templates: ${issue.templates.join(', ')}`}</span>
      </div>
      <div className="issue-pages">
        <DataTable caption={`Pages affected by ${issue.title}`} columns={columns} rows={detail.data.pages} rowKey={p => `${p.url}|${p.device}`} maxHeight="320px" dense />
      </div>
    </div>
  )
}

export function ScanIssues({ scan, refresh }: { scan: Scan, refresh: number }) {
  const [params, setParams] = useSearchParams()
  const category = (params.get('category') as Category | null) ?? ''
  const device = (params.get('device') as Device | null) ?? 'all'
  const template = params.get('template') ?? ''
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())

  const input: IssueQuery = { scanId: scan.id, limit: LIMIT, offset }
  if (category)
    input.category = category
  if (device !== 'all')
    input.device = device
  if (template)
    input.template = template
  const issues = useQuery('issues.list', input, refresh)
  const templates = useQuery('scans.templates', { scanId: scan.id }).data

  const toggle = (issue: Issue) => setExpanded((prev) => {
    const next = new Set(prev)
    const key = issueKey(issue)
    if (next.has(key))
      next.delete(key)
    else
      next.add(key)
    return next
  })

  const columns: Column<Issue>[] = [
    { key: 'severity', header: <span className="sr-only">Severity</span>, render: issue => <SeverityBadge severity={issue.severity} /> },
    {
      key: 'title',
      header: 'Issue',
      className: 'cell-title',
      sortValue: issue => issue.title,
      render: issue => (
        <span className="url-cell">
          <span style={{ fontWeight: 500 }}>{issue.title}</span>
          {issue.items > 1 && <span className="cell-sub">{`${formatCount(issue.items)} resources`}</span>}
        </span>
      ),
    },
    { key: 'category', header: 'Category', hideBelow: 'md', sortValue: issue => issue.category, render: issue => <span className="muted">{issue.category ? CATEGORY_LABELS[issue.category] : '—'}</span> },
    { key: 'pages', header: 'Pages', align: 'right', sortValue: issue => issue.pages, defaultOrder: 'desc', render: issue => <span className="num">{formatCount(issue.pages)}</span> },
    { key: 'templates', header: 'Templates', align: 'right', hideBelow: 'md', sortValue: issue => issue.templates.length, defaultOrder: 'desc', render: issue => <span className="num" title={issue.templates.join(', ')}>{issue.templates.length}</span> },
    { key: 'ms', header: 'Savings', align: 'right', hideBelow: 'sm', sortValue: issue => issue.savingsMs, defaultOrder: 'desc', render: issue => <span className="num">{issue.savingsMs ? formatMs(issue.savingsMs) : '—'}</span> },
    { key: 'bytes', header: 'Bytes', align: 'right', hideBelow: 'md', sortValue: issue => issue.savingsBytes, defaultOrder: 'desc', render: issue => <span className="num">{formatBytes(issue.savingsBytes)}</span> },
    { key: 'impact', header: 'Impact', align: 'right', hideBelow: 'sm', sortValue: issue => issue.impact, defaultOrder: 'desc', render: issue => <span className="num">{formatCount(issue.impact)}</span> },
  ]

  return (
    <div className="card">
      <div className="toolbar">
        <label className="field">
          <span>Category</span>
          <select className="select" value={category} onChange={event => setParams({ category: event.target.value || null, offset: null })}>
            <option value="">All categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </label>
        <div className="field">
          <span className="field-label">Device</span>
          <DeviceToggle value={device} devices={scan.devices} includeAll onChange={value => setParams({ device: value === 'all' ? null : value, offset: null })} />
        </div>
        <TemplateFilter value={template} options={templates} onChange={next => setParams({ template: next || null, offset: null })} />
        <span className="spacer" />
        <span className="faint" style={{ fontSize: 'var(--text-sm)', paddingBottom: 6 }}>Same audit across pages and resources counts as one issue</span>
      </div>
      {issues.error
        ? <ErrorState error={issues.error} onRetry={issues.reload} compact />
        : (
            <DataTable
              caption="Issues ranked by impact"
              columns={columns}
              rows={issues.data?.items}
              rowKey={issueKey}
              loading={issues.loading}
              defaultSort={{ key: 'impact', order: 'desc' }}
              onRowActivate={toggle}
              renderExpanded={issue => <IssueDetail scanId={scan.id} issue={issue} />}
              expanded={expanded}
              empty={<EmptyState title="No issues" compact>Nothing failed for this filter.</EmptyState>}
              pagination={{ offset, limit: LIMIT, total: issues.data?.total ?? 0, onChange: next => setParams({ offset: next || null }) }}
            />
          )}
    </div>
  )
}
