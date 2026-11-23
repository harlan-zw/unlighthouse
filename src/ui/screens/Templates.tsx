import { Fragment, useState } from 'react'
import { CATEGORIES } from '../../types.ts'
import { EmptyState, ErrorState, Skeleton } from '../components/controls.tsx'
import { LabTag } from '../components/issues.tsx'
import { TopBar } from '../components/layout.tsx'
import { formatCount, formatScore, hostOf, pathOf, plural, scoreRating } from '../format.ts'
import { useDocumentTitle, useQuery } from '../hooks.ts'
import { Link, routeHref } from '../router.tsx'
import { samplePerTemplate, useScope } from '../scope.tsx'
import type { Page } from '../../types.ts'

const SAMPLE_LIMIT = 10
const HEADERS = ['Perf', 'A11y', 'Best pr.', 'SEO', 'Agentic'] as const

function SampleRow({ scanId, page }: { scanId: string, page: Page }) {
  const detail = useQuery('pages.get', { scanId, url: page.url, device: page.device })
  return (
    <Link className="sample" to={routeHref({ name: 'page', scanId, url: page.url, device: page.device })}>
      <span className="mono truncate" title={page.url}>{pathOf(page.url)}</span>
      <span className="muted">{`${page.device === 'mobile' ? 'Mobile' : 'Desktop'}${detail.data ? ` · ${plural(detail.data.findings.length, 'issue')}` : ''}`}</span>
    </Link>
  )
}

function Samples({ scanId, template }: { scanId: string, template: string }) {
  const pages = useQuery('pages.list', { scanId, template, status: 'done', limit: SAMPLE_LIMIT, offset: 0 })
  if (pages.error)
    return <ErrorState error={pages.error} onRetry={pages.reload} compact />
  if (!pages.data)
    return <Skeleton lines={3} height={28} />
  if (pages.data.items.length === 0)
    return <EmptyState title="No audited pages" compact />
  return <div className="samples">{pages.data.items.map(page => <SampleRow key={`${page.url}|${page.device}`} scanId={scanId} page={page} />)}</div>
}

export function TemplatesPage() {
  const { scan, summary, templates, error } = useScope()
  const [open, setOpen] = useState<string | null>(null)
  const host = scan ? hostOf(scan.origin) : '…'
  useDocumentTitle(host === '…' ? 'Templates' : `Templates · ${host}`)
  const crumbs = scan
    ? [{ label: host, href: routeHref({ name: 'site', siteId: scan.siteId }) }, { label: 'Templates' }]
    : [{ label: host }, { label: 'Templates' }]

  if (error && !scan)
    return <ErrorState error={error} />
  if (!scan || !templates)
    return <><TopBar crumbs={crumbs} /><div className="pad"><Skeleton lines={6} height={44} /></div></>

  const expanded = open ?? templates[0]?.template ?? ''
  const sample = samplePerTemplate(scan)
  const sub = [summary ? plural(summary.pages.discovered, 'page') : null, sample > 0 ? `${sample} audited per template` : 'all audited'].filter(Boolean).join(' · ')

  return (
    <>
      <TopBar crumbs={crumbs} />
      <section className="hero">
        <div className="hero-main">
          <h1>{plural(templates.length, 'template')}</h1>
          <span className="hero-sub">{sub}</span>
        </div>
      </section>
      <div className="scroll-x">
        <table className="tpl-table">
          <thead>
            <tr>
              <th scope="col">Template</th>
              <th scope="col" className="right">Pages</th>
              {HEADERS.map((label, i) => (
                <th key={label} scope="col" className="right">
                  {label}
                  {i === 0 && <>{' '}<LabTag summary={summary} /></>}
                </th>
              ))}
              <th scope="col">Top issue</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((t) => {
              const isOpen = expanded === t.template
              return (
                <Fragment key={t.template}>
                  <tr className={isOpen ? 'open' : undefined}>
                    <th scope="row">
                      <button type="button" className="expander mono" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? '' : t.template)}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true" style={{ transform: isOpen ? 'rotate(90deg)' : 'none' }}><path d="M9 6l6 6-6 6" /></svg>
                        {t.template}
                      </button>
                    </th>
                    <td className="right num">{formatCount(t.pages)}</td>
                    {CATEGORIES.map(category => <td key={category} className={`right num r-${scoreRating(t.scores[category])}`}>{formatScore(t.scores[category])}</td>)}
                    <td>{t.topIssue ? <Link className="top-issue" to={routeHref({ name: 'issue', scanId: scan.id, auditId: t.topIssue.auditId })}>{t.topIssue.title}</Link> : <span className="faint">—</span>}</td>
                  </tr>
                  {isOpen && (
                    <tr className="expansion">
                      <td colSpan={8}><Samples scanId={scan.id} template={t.template} /></td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
      {templates.length === 0 && <EmptyState title="No templates" compact />}
    </>
  )
}
