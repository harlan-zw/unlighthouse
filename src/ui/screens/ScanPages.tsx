import { useEffect, useState } from 'react'
import type { PageQuery, TemplateCount } from '../../contracts.ts'
import { CATEGORIES, METRICS, type Device, type Page, type PageStatus, type Scan } from '../../types.ts'
import { useDebounced, useDocumentTitle, useQuery } from '../hooks.ts'
import { CATEGORY_LABELS, CATEGORY_SHORT, hostOf, METRIC_LABELS, METRIC_SHORT, plural } from '../format.ts'
import { Link, navigate, routeHref, useSearchParams } from '../router.tsx'
import { DeviceToggle, EmptyState, ErrorState, ScanPill, Skeleton, StatusBadge, TemplateFilter } from '../components/controls.tsx'
import { DataTable, type Column, type SortState } from '../components/DataTable.tsx'
import { Hero, TopBar } from '../components/layout.tsx'
import { MetricValue, Score } from '../components/score.tsx'
import { useScope } from '../scope.tsx'

const LIMIT = 50
const STATUSES: PageStatus[] = ['done', 'failed', 'skipped', 'queued', 'running']
type SortKey = NonNullable<PageQuery['sort']>
const SORT_KEYS: readonly string[] = [...CATEGORIES, ...METRICS, 'url', 'template']

function PagesTable({ scan, refresh, templates }: { scan: Scan, refresh: number, templates: TemplateCount[] | undefined }) {
  const [params, setParams] = useSearchParams()
  const device = (params.get('device') as Device | null) ?? 'all'
  const template = params.get('template') ?? ''
  const status = (params.get('status') as PageStatus | null) ?? ''
  const sortParam = params.get('sort')
  const sort: SortKey = sortParam && SORT_KEYS.includes(sortParam) ? sortParam as SortKey : 'performance'
  const order = params.get('order') === 'desc' ? 'desc' : 'asc'
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0)
  const [search, setSearch] = useState(params.get('q') ?? '')
  const debounced = useDebounced(search, 250)

  useEffect(() => {
    if ((params.get('q') ?? '') !== debounced)
      setParams({ q: debounced, offset: null })
  }, [debounced])

  const input: PageQuery = { scanId: scan.id, sort, order, limit: LIMIT, offset }
  if (device !== 'all')
    input.device = device
  if (template)
    input.template = template
  if (status)
    input.status = status
  if (debounced)
    input.search = debounced
  const pages = useQuery('pages.list', input, refresh)

  const pageHref = (page: Page) => routeHref({ name: 'page', scanId: scan.id, url: page.url, device: page.device })
  const columns: Column<Page>[] = [
    {
      key: 'url',
      header: 'Page',
      sortable: true,
      className: 'cell-url',
      render: page => (
        <span className="url-cell">
          <Link to={pageHref(page)} className="url-path" title={page.url}>{page.path}</Link>
          <span className="cell-sub mono">{page.template}</span>
        </span>
      ),
    },
    {
      key: 'device',
      header: <span className="sr-only">Device</span>,
      render: page => (
        <span className="faint" title={page.device}>
          {page.device === 'mobile' ? 'M' : 'D'}
          <span className="sr-only">{page.device}</span>
        </span>
      ),
    },
    ...CATEGORIES.map(category => ({
      key: category,
      header: CATEGORY_SHORT[category],
      title: CATEGORY_LABELS[category],
      sortable: true,
      defaultOrder: 'asc' as const,
      align: 'right' as const,
      ...(category === 'performance' ? {} : { hideBelow: 'sm' as const }),
      render: (page: Page) => page.status === 'done' ? <Score score={page.scores[category]} label={CATEGORY_LABELS[category]} /> : category === 'performance' ? <StatusBadge status={page.status} /> : <span className="faint">—</span>,
    })),
    ...METRICS.map(metric => ({
      key: metric,
      header: METRIC_SHORT[metric],
      title: METRIC_LABELS[metric],
      sortable: true,
      defaultOrder: 'desc' as const,
      align: 'right' as const,
      hideBelow: (metric === 'lcp' ? 'sm' : 'md') as 'sm' | 'md',
      render: (page: Page) => <MetricValue metric={metric} value={page.metrics[metric]} device={page.device} icon={false} />,
    })),
  ]

  const onSort = (next: SortState) => setParams({ sort: next.key, order: next.order, offset: null })

  return (
    <div className="table-wrap">
      <div className="toolbar" role="search">
        <label className="field grow">
          <span>Search</span>
          <input className="input input-search" type="search" placeholder="Filter by URL" value={search} onChange={event => setSearch(event.target.value)} />
        </label>
        <div className="field">
          <span className="field-label">Device</span>
          <DeviceToggle value={device} devices={scan.devices} includeAll onChange={value => setParams({ device: value === 'all' ? null : value, offset: null })} />
        </div>
        <TemplateFilter value={template} options={templates} onChange={next => setParams({ template: next || null, offset: null })} />
        <label className="field">
          <span>Status</span>
          <select className="select" value={status} onChange={event => setParams({ status: event.target.value || null, offset: null })}>
            <option value="">Any status</option>
            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
      </div>
      {pages.error
        ? <ErrorState error={pages.error} onRetry={pages.reload} compact />
        : (
            <DataTable
              caption="Pages"
              columns={columns}
              rows={pages.data?.items}
              rowKey={page => `${page.url}|${page.device}`}
              loading={pages.loading}
              sort={{ key: sort, order }}
              onSortChange={onSort}
              onRowActivate={page => navigate(pageHref(page))}
              maxHeight="calc(100vh - 220px)"
              empty={(
                <EmptyState title="No pages match" compact action={<button type="button" className="btn btn-sm" onClick={() => { setSearch(''); setParams({ q: null, device: null, template: null, status: null, offset: null }) }}>Clear filters</button>} />
              )}
              pagination={{ offset, limit: LIMIT, total: pages.data?.total ?? 0, onChange: next => setParams({ offset: next || null }) }}
            />
          )}
    </div>
  )
}

export function PagesPage() {
  const { scan, summary, templates, refresh, error } = useScope()
  const host = scan ? hostOf(scan.origin) : '…'
  useDocumentTitle(host === '…' ? 'Pages' : `Pages · ${host}`)
  if (error && !scan)
    return <ErrorState error={error} />
  if (!scan)
    return <><TopBar crumbs={[{ label: host }, { label: 'Pages' }]} /><div className="pad"><Skeleton lines={6} height={36} /></div></>
  return (
    <>
      <TopBar crumbs={[{ label: host, href: routeHref({ name: 'site', siteId: scan.siteId }) }, { label: 'Pages' }]} status={<ScanPill status={scan.status} />} />
      <Hero title={summary ? plural(summary.pages.discovered, 'page') : 'Pages'} />
      <PagesTable scan={scan} refresh={refresh} templates={templates} />
    </>
  )
}
