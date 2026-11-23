import { useEffect, useRef, useState } from 'react'
import { ScanPill, isActive } from '../components/controls.tsx'
import { TopBar } from '../components/layout.tsx'
import { formatCount, hostOf, pathOf, plural } from '../format.ts'
import { useScanEvents } from '../hooks.ts'
import { useRestart } from '../restart.ts'
import { Link, routeHref } from '../router.tsx'
import { samplePerTemplate, useScope } from '../scope.tsx'

type FeedKind = 'found' | 'audit' | 'failed' | 'done'

interface FeedEntry {
  id: number
  kind: FeedKind
  text: string
}

interface TemplateState {
  pages: number
  audited: number
}

const FEED_SIZE = 9
const MAX_TEMPLATES = 8
const MAX_DOTS = 5

function clock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000))
  return `${Math.floor(total / 60)}m ${String(total % 60).padStart(2, '0')}s`
}

function reducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function LiveScanPage({ onLeave }: { onLeave: () => void }) {
  const { scan, summary, templates, siteScans } = useScope()
  const { restart, busy, error } = useRestart(scan)
  const [tpl, setTpl] = useState<Map<string, TemplateState>>(new Map())
  const [feed, setFeed] = useState<FeedEntry[]>([])
  const [findings, setFindings] = useState(0)
  const [shown, setShown] = useState(0)
  const [merge, setMerge] = useState(0)
  const [now, setNow] = useState(Date.now())
  const urlTemplate = useRef(new Map<string, string>())
  const auditedUrls = useRef(new Set<string>())
  const sequence = useRef(0)
  const findingsRef = useRef(0)
  findingsRef.current = findings

  const done = scan?.status === 'done'
  const target = done && summary?.scan.status === 'done' ? summary.issueCount : null

  const push = (kind: FeedKind, text: string) => setFeed(prev => [{ id: ++sequence.current, kind, text }, ...prev].slice(0, FEED_SIZE))

  useEffect(() => {
    if (templates)
      setTpl(new Map(templates.map(t => [t.template, { pages: t.pages, audited: t.audited }])))
  }, [templates])

  useEffect(() => {
    if (summary)
      setFindings(summary.findingCount)
  }, [summary])

  useScanEvents(scan?.id ?? null, (event) => {
    if (event.type === 'page:discovered') {
      if (urlTemplate.current.has(event.url))
        return
      urlTemplate.current.set(event.url, event.template)
      setTpl((prev) => {
        const next = new Map(prev)
        const current = next.get(event.template) ?? { pages: 0, audited: 0 }
        next.set(event.template, { ...current, pages: current.pages + 1 })
        return next
      })
      push('found', pathOf(event.url))
    }
    else if (event.type === 'page:status' && event.status === 'done') {
      setFindings(n => n + (event.findings ?? 0))
      const template = urlTemplate.current.get(event.url)
      if (template && !auditedUrls.current.has(event.url)) {
        auditedUrls.current.add(event.url)
        setTpl((prev) => {
          const current = prev.get(template)
          return current ? new Map(prev).set(template, { ...current, audited: current.audited + 1 }) : prev
        })
      }
      push('audit', `${pathOf(event.url)} · ${event.device}`)
    }
    else if (event.type === 'page:status' && event.status === 'failed') {
      push('failed', `${pathOf(event.url)} · ${event.device}`)
    }
  })

  useEffect(() => {
    if (target === null)
      setShown(findings)
  }, [target, findings])

  useEffect(() => {
    if (target === null)
      return
    const from = findingsRef.current
    if (reducedMotion()) {
      setShown(target)
      setMerge(1)
      push('done', `${plural(target, 'issue')} from ${plural(from, 'finding')}`)
      return
    }
    const start = performance.now()
    let frame = 0
    const tick = (time: number) => {
      const p = Math.min(1, (time - start) / 1200)
      const eased = 1 - (1 - p) ** 3
      setShown(Math.round(from + (target - from) * eased))
      setMerge(eased)
      if (p < 1)
        frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    push('done', `${plural(target, 'issue')} from ${plural(from, 'finding')}`)
    return () => cancelAnimationFrame(frame)
  }, [target])

  const active = scan ? isActive(scan.status) : false
  useEffect(() => {
    if (!active)
      return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])

  if (!scan)
    return null

  const host = hostOf(scan.origin)
  const number = siteScans.numberOf(scan.id)
  const { stats } = scan
  const finished = stats.done + stats.failed
  const total = finished + stats.queued
  const auditing = scan.status === 'auditing'
  const discovered = scan.status !== 'queued' && scan.status !== 'discovering'
  const options = scan.options as { concurrency?: unknown } | null
  const workers = typeof options?.concurrency === 'number' ? options.concurrency : null
  const sample = samplePerTemplate(scan)
  const rows = [...tpl].sort((a, b) => b[1].pages - a[1].pages || (a[0] < b[0] ? -1 : 1))
  const visible = rows.slice(0, MAX_TEMPLATES)
  const rest = rows.slice(MAX_TEMPLATES)
  const biggest = rows[0]?.[1].pages ?? 1
  const steps = [
    { name: 'Discover', progress: discovered || done ? 1 : 0, running: scan.status === 'discovering', complete: discovered },
    { name: 'Audit', progress: auditing ? (total > 0 ? finished / total : 0) : discovered && scan.status !== 'failed' && scan.status !== 'cancelled' ? 1 : 0, running: auditing, complete: done },
    { name: 'Merge', progress: done ? merge : 0, running: done && merge < 1, complete: done && merge >= 1 },
  ]
  const elapsed = scan.startedAt ? (scan.finishedAt ?? now) - scan.startedAt : 0

  return (
    <>
      <TopBar
        crumbs={[{ label: host, href: routeHref({ name: 'site', siteId: scan.siteId }) }, { label: 'Scans', href: routeHref({ name: 'site', siteId: scan.siteId }) }, { label: number ? `#${number}` : scan.id }]}
        status={<ScanPill status={scan.status} />}
        actions={(
          <>
            <span className="mono muted small">{[scan.devices.join(' + '), workers ? `${workers} workers` : null].filter(Boolean).join(' · ')}</span>
            <button type="button" className="btn btn-primary" onClick={() => void restart()} disabled={busy}>{active ? 'Restart' : 'Scan again'}</button>
          </>
        )}
      />
      {error && <p className="field-error pad-x" role="alert">{error}</p>}
      <div className="steps">
        {steps.map(step => (
          <div key={step.name} className={`step${step.progress > 0 || step.running ? ' on' : ''}`}>
            <span className="step-name">
              <span className={`step-mark${step.complete ? ' full' : ''}`} aria-hidden="true">{step.complete ? '✓' : ''}</span>
              {step.name}
            </span>
            <span className="step-bar"><span className={`step-fill${step.running && step.name === 'Discover' ? ' indeterminate' : ''}`} style={{ width: `${Math.round(step.progress * 100)}%` }} /></span>
          </div>
        ))}
      </div>
      <section className="counters" aria-label="Counters" aria-live="polite">
        <div className="counter"><span className="counter-value num">{formatCount(stats.discovered)}</span><span className="muted">pages</span></div>
        <div className="counter"><span className="counter-value num">{formatCount(tpl.size)}</span><span className="muted">templates</span></div>
        <div className="counter"><span className="counter-value num">{formatCount(stats.done)}</span><span className="muted">{`audits of ${formatCount(stats.done + stats.queued)}`}</span></div>
        <div className={`counter${target !== null ? ' final' : ''}`}><span className="counter-value num">{formatCount(shown)}</span><span className="muted">{target !== null ? 'issues' : 'findings'}</span></div>
      </section>
      <div className="live-cols">
        <section className="panel live-templates" aria-label="Templates">
          <div className="panel-head">
            <span>Templates</span>
            <span className="muted">{sample > 0 ? `${sample} sampled each` : 'all audited'}</span>
          </div>
          {visible.map(([pattern, state]) => {
            const dots = Math.max(1, Math.min(MAX_DOTS, state.pages))
            const filled = Math.min(dots, state.audited)
            return (
              <div key={pattern} className="live-template">
                <span className="mono truncate" title={pattern}>{pattern}</span>
                <span className="share"><span className="share-fill" style={{ width: `${Math.round((state.pages / biggest) * 100)}%` }} /></span>
                <span className="num text-2 right">{formatCount(state.pages)}</span>
                <span className="dots" role="img" aria-label={`${filled} of ${dots} sampled pages audited`}>
                  {Array.from({ length: dots }, (_, i) => <span key={i} className={`dot${i < filled ? ' on' : ''}`} />)}
                </span>
              </div>
            )
          })}
          {rest.length > 0 && (
            <div className="live-template">
              <span className="muted">{`${formatCount(rest.length)} more templates`}</span>
              <span />
              <span className="num text-2 right">{formatCount(rest.reduce((sum, [, state]) => sum + state.pages, 0))}</span>
              <span />
            </div>
          )}
        </section>
        <section className="panel live-activity" aria-label="Activity">
          <div className="panel-head">
            <span>Activity</span>
            <span className="muted num">{clock(elapsed)}</span>
          </div>
          <ol className="feed">
            {feed.map((entry, i) => (
              <li key={entry.id} style={{ opacity: Math.max(0.35, 1 - i * 0.08) }}>
                <span className={`feed-kind k-${entry.kind}`}>{entry.kind}</span>
                <span className="truncate">{entry.text}</span>
              </li>
            ))}
          </ol>
        </section>
        {(scan.status === 'failed' || scan.status === 'cancelled') && scan.error && <p className="scan-error mono" role="alert">{scan.error}</p>}
        {target !== null && summary && merge >= 1 && (
          <section className="panel live-top" aria-label="Top issues">
            <div className="panel-head">
              <span>Top issues</span>
              <Link to={routeHref({ name: 'scan', scanId: scan.id })} onClick={onLeave}>{`All ${formatCount(summary.issueCount)} issues`}</Link>
            </div>
            {summary.topIssues.slice(0, 4).map(issue => (
              <Link key={issue.auditId} className="top-row" to={routeHref({ name: 'issue', scanId: scan.id, auditId: issue.auditId })}>
                <span className="issue-title">{issue.title}</span>
                <span className="num text-2">{plural(issue.pages, 'page')}</span>
              </Link>
            ))}
          </section>
        )}
      </div>
    </>
  )
}
