import { useState } from 'react'
import type { TemplateCount } from '../../contracts.ts'
import type { Device } from '../../types.ts'
import { ErrorState, Skeleton } from '../components/controls.tsx'
import { CopyButton, TopBar, type Crumb } from '../components/layout.tsx'
import { coversAll, severityLabel, TemplateTag } from '../components/issues.tsx'
import { CATEGORY_LABELS, formatCount, hostOf, pathOf, plural } from '../format.ts'
import { useClient, useDocumentTitle, useQuery } from '../hooks.ts'
import { Link, routeHref } from '../router.tsx'
import { useScope } from '../scope.tsx'

const ITEM_PREVIEW = 8

function ItemOrigin({ templates, known }: { templates: string[], known: TemplateCount[] | undefined }) {
  if (coversAll(templates, known))
    return <TemplateTag>all templates</TemplateTag>
  return (
    <span className="origin">
      <TemplateTag>{templates[0] ?? ''}</TemplateTag>
      {templates.length > 1 && <span className="faint small" title={templates.slice(1).join(', ')}>{`+${templates.length - 1}`}</span>}
    </span>
  )
}

export function IssueDetailPage({ auditId }: { auditId: string }) {
  const client = useClient()
  const { scan, summary, templates: scanTemplates } = useScope()
  const detail = useQuery('issues.get', scan ? { scanId: scan.id, auditId } : null)
  const [all, setAll] = useState(false)
  const data = detail.data
  const issue = data?.issue
  const host = scan ? hostOf(scan.origin) : '…'
  useDocumentTitle(issue ? issue.title : 'Issue')

  const crumbs: Crumb[] = scan
    ? [{ label: host, href: routeHref({ name: 'site', siteId: scan.siteId }) }, { label: 'Issues', href: routeHref({ name: 'scan', scanId: scan.id }) }, { label: issue?.title ?? auditId }]
    : [{ label: host }, { label: 'Issues' }, { label: auditId }]

  if (detail.error)
    return <><TopBar crumbs={crumbs} /><ErrorState error={detail.error} onRetry={detail.reload} /></>
  if (!scan || !data || !issue)
    return <><TopBar crumbs={crumbs} /><div className="pad"><Skeleton lines={5} height={28} /></div></>

  const call = `issues.get\n  scan: ${scan.id}\n  audit: ${issue.auditId}`
  const byTemplate = new Map<string, { urls: Set<string>, example: string, device: Device }>()
  for (const page of data.pages) {
    const entry = byTemplate.get(page.template) ?? { urls: new Set<string>(), example: page.url, device: page.device }
    entry.urls.add(page.url)
    byTemplate.set(page.template, entry)
  }
  const templates = [...byTemplate].sort((a, b) => b[1].urls.size - a[1].urls.size || (a[0] < b[0] ? -1 : 1))
  const biggest = templates[0]?.[1].urls.size ?? 1
  const items = all ? data.items : data.items.slice(0, ITEM_PREVIEW)
  const first = data.pages[0]
  const report = first ? client.reportUrl(scan.id, first.device, first.url) : null
  const total = summary?.pages.audited
  const line = [
    total ? `${formatCount(issue.pages)} of ${plural(total, 'page')}` : plural(issue.pages, 'page'),
    issue.items > 0 ? plural(issue.items, 'element') : null,
    plural(issue.templates.length, 'template'),
  ].filter(Boolean).join(' · ')

  return (
    <>
      <TopBar
        crumbs={crumbs}
        actions={(
          <>
            <CopyButton text={call}>Copy for agent</CopyButton>
            {client.mode === 'live' && <a className="btn" href={`/export/${encodeURIComponent(scan.id)}/issues.csv`} download>Export CSV</a>}
          </>
        )}
      />
      <div className="detail">
        <div className="detail-main">
          <div className="detail-title">
            <h1>{issue.title}</h1>
            <p className="text-2">{line}</p>
          </div>
          {data.items.length > 0 && (
            <section className="panel" aria-labelledby="items-h">
              <div className="panel-head"><h2 id="items-h">{`Elements · ${formatCount(data.items.length)}`}</h2></div>
              <div className="scroll-x">
                <table className="plain-table">
                  <thead>
                    <tr><th scope="col">Element</th><th scope="col">Comes from</th><th scope="col" className="right">Pages</th></tr>
                  </thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item.key}>
                        <td className="mono cell-wrap" title={item.key}>{item.label ?? item.key}</td>
                        <td>{item.templates[0] && <ItemOrigin templates={item.templates} known={scanTemplates} />}</td>
                        <td className="right num">{formatCount(item.pages)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.items.length > ITEM_PREVIEW && (
                <button type="button" className="link-button" aria-expanded={all} onClick={() => setAll(v => !v)}>
                  {all ? 'Show fewer' : `Show all ${formatCount(data.items.length)} items`}
                </button>
              )}
            </section>
          )}
          <section aria-labelledby="templates-h" className="stack-3">
            <h2 id="templates-h" className="small-title">Templates</h2>
            <div className="cards">
              {templates.map(([pattern, entry]) => (
                <div key={pattern} className="template-card">
                  <span className="template-card-head">
                    <TemplateTag>{pattern}</TemplateTag>
                    <span className="muted num">{plural(entry.urls.size, 'page')}</span>
                  </span>
                  <span className="share"><span className="share-fill sev" style={{ width: `${Math.round((entry.urls.size / biggest) * 100)}%` }} /></span>
                  <Link className="mono faint small truncate" to={routeHref({ name: 'page', scanId: scan.id, url: entry.example, device: entry.device })} title={entry.example}>{pathOf(entry.example)}</Link>
                </div>
              ))}
            </div>
          </section>
        </div>
        <aside className="detail-side" aria-label="Issue properties">
          <dl className="props">
            <dt>Category</dt>
            <dd>{issue.category ? CATEGORY_LABELS[issue.category] : '—'}</dd>
            <dt>Severity</dt>
            <dd className={issue.severity === 'fail' ? 'c-new' : 'c-medium'}>{severityLabel(issue.severity)}</dd>
            <dt>Devices</dt>
            <dd>{issue.devices.map(d => d === 'mobile' ? 'Mobile' : 'Desktop').join(', ')}</dd>
            <dt>Audit</dt>
            <dd className="mono">{issue.auditId}</dd>
          </dl>
          <hr className="rule" />
          <div className="stack-3">
            <span className="strong">Agent</span>
            <pre className="code-block">{call}</pre>
          </div>
          {report && <a className="small" href={report} target="_blank" rel="noreferrer">Lighthouse report</a>}
        </aside>
      </div>
    </>
  )
}
