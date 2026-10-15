import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import type { TemplateCount } from '../../contracts.ts'
import type { Device, PageStatus, ScanStatus, Severity } from '../../types.ts'
import { ApiError } from '../api.ts'
import { formatCount } from '../format.ts'
import { Link, navigate } from '../router.tsx'

export type Tone = 'good' | 'average' | 'poor' | 'neutral' | 'info' | 'accent'

export function Badge({ tone = 'neutral', children, title, pulse }: { tone?: Tone, children: ReactNode, title?: string, pulse?: boolean }) {
  return (
    <span className={`badge t-${tone}${pulse ? ' pulse' : ''}`} title={title}>
      <span className="badge-dot" aria-hidden="true" />
      {children}
    </span>
  )
}

const SCAN_TONES: Record<ScanStatus, Tone> = {
  queued: 'neutral',
  discovering: 'info',
  auditing: 'info',
  done: 'good',
  cancelled: 'neutral',
  failed: 'poor',
}

const PAGE_TONES: Record<PageStatus, Tone> = {
  queued: 'neutral',
  running: 'info',
  done: 'good',
  failed: 'poor',
  skipped: 'neutral',
}

export function isActive(status: ScanStatus): boolean {
  return status === 'queued' || status === 'discovering' || status === 'auditing'
}

export function StatusBadge({ status }: { status: ScanStatus | PageStatus }) {
  const tone = status in SCAN_TONES ? SCAN_TONES[status as ScanStatus] : PAGE_TONES[status as PageStatus]
  const pulse = status === 'discovering' || status === 'auditing' || status === 'running'
  return <Badge tone={tone} pulse={pulse}>{status}</Badge>
}

export function SeverityBadge({ severity }: { severity: Severity }) {
  return <Badge tone={severity === 'fail' ? 'poor' : 'average'}>{severity === 'fail' ? 'Fail' : 'Warn'}</Badge>
}

export interface TabItem {
  id: string
  label: string
  href: string
  count?: number | null
}

export function Tabs({ items, active, label, idPrefix = 'tab' }: { items: TabItem[], active: string, label: string, idPrefix?: string }) {
  const listRef = useRef<HTMLDivElement>(null)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = items.findIndex(item => item.id === active)
    let next = -1
    if (event.key === 'ArrowRight')
      next = (index + 1) % items.length
    else if (event.key === 'ArrowLeft')
      next = (index - 1 + items.length) % items.length
    else if (event.key === 'Home')
      next = 0
    else if (event.key === 'End')
      next = items.length - 1
    const target = items[next]
    if (!target)
      return
    event.preventDefault()
    navigate(target.href, { replace: true })
    requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`#${idPrefix}-${target.id}`)?.focus())
  }
  return (
    <div className="tabs" role="tablist" aria-label={label} ref={listRef} onKeyDown={onKeyDown}>
      {items.map(item => (
        <Link
          key={item.id}
          id={`${idPrefix}-${item.id}`}
          to={item.href}
          role="tab"
          className="tab"
          aria-selected={item.id === active}
          aria-controls={`${idPrefix}-panel`}
          tabIndex={item.id === active ? 0 : -1}
        >
          {item.label}
          {item.count !== undefined && item.count !== null && <span className="tab-count">{formatCount(item.count)}</span>}
        </Link>
      ))}
    </div>
  )
}

export interface ProgressSegment {
  value: number
  tone: Tone
  label: string
}

export function ProgressBar({ value, max, segments, label, indeterminate }: { value: number, max: number, segments?: ProgressSegment[], label: string, indeterminate?: boolean }) {
  const parts = segments ?? [{ value, tone: 'accent' as Tone, label }]
  const percent = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div
      className={`progress${indeterminate ? ' indeterminate' : ''}`}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={indeterminate ? undefined : max}
      aria-valuenow={indeterminate ? undefined : value}
      aria-valuetext={indeterminate ? 'in progress' : `${percent}%`}
    >
      {!indeterminate && parts.map(part => (
        <span
          key={part.label}
          className={`progress-seg t-${part.tone}`}
          style={{ width: `${max > 0 ? (part.value / max) * 100 : 0}%` }}
          title={`${part.label}: ${formatCount(part.value)}`}
        />
      ))}
    </div>
  )
}

function DeviceIcon({ device }: { device: Device | 'all' }) {
  if (device === 'mobile') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="4" y="1.5" width="8" height="13" rx="1.5" />
        <path d="M7 12h2" />
      </svg>
    )
  }
  if (device === 'desktop') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
        <rect x="1.5" y="2.5" width="13" height="8.5" rx="1" />
        <path d="M5.5 14h5M8 11v3" />
      </svg>
    )
  }
  return null
}

export function DeviceLabel({ device }: { device: Device }) {
  return (
    <span className="device-label">
      <DeviceIcon device={device} />
      {device === 'mobile' ? 'Mobile' : 'Desktop'}
    </span>
  )
}

export function Segmented<T extends string>({ value, options, onChange, label, size }: { value: T, options: Array<{ value: T, label: ReactNode, title?: string }>, onChange: (value: T) => void, label: string, size?: 'sm' }) {
  const ref = useRef<HTMLDivElement>(null)
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = options.findIndex(option => option.value === value)
    let next = -1
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown')
      next = (index + 1) % options.length
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
      next = (index - 1 + options.length) % options.length
    const target = options[next]
    if (!target)
      return
    event.preventDefault()
    onChange(target.value)
    requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus())
  }
  return (
    <div className={`segmented${size === 'sm' ? ' sm' : ''}`} role="radiogroup" aria-label={label} ref={ref} onKeyDown={onKeyDown}>
      {options.map(option => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          title={option.title}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

export function DeviceToggle<T extends Device | 'all'>({ value, devices, onChange, includeAll }: { value: T, devices: Device[], onChange: (device: T) => void, includeAll?: boolean }) {
  const options: Array<{ value: T, label: ReactNode, title?: string }> = []
  if (includeAll)
    options.push({ value: 'all' as T, label: 'All' })
  for (const device of devices) {
    options.push({
      value: device as T,
      title: device === 'mobile' ? 'Mobile' : 'Desktop',
      label: (
        <>
          <DeviceIcon device={device} />
          <span className="seg-text">{device === 'mobile' ? 'Mobile' : 'Desktop'}</span>
        </>
      ),
    })
  }
  return <Segmented value={value} options={options} onChange={onChange} label="Device" />
}

export function EmptyState({ title, children, action, compact }: { title: string, children?: ReactNode, action?: ReactNode, compact?: boolean }) {
  return (
    <div className={`state${compact ? ' compact' : ''}`}>
      <svg className="state-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
        <path d="M3.5 9.5h17M8 14h8" />
      </svg>
      <p className="state-title">{title}</p>
      {children && <div className="state-body">{children}</div>}
      {action && <div className="state-action">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry, compact }: { error: Error, onRetry?: () => void, compact?: boolean }) {
  const code = error instanceof ApiError ? error.code : null
  const title = code === 'NOT_FOUND' ? 'Not found' : code === 'UNAUTHORIZED' || code === 'FORBIDDEN' ? 'Not allowed' : 'Something went wrong'
  return (
    <div className={`state error${compact ? ' compact' : ''}`} role="alert">
      <svg className="state-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        <path d="M12 3.5 21.5 20h-19Z" />
        <path d="M12 10v4.5M12 17v.5" />
      </svg>
      <p className="state-title">{title}</p>
      <div className="state-body">
        {error.message}
        {code && <code className="state-code">{code}</code>}
      </div>
      {onRetry && (
        <div className="state-action">
          <button type="button" className="btn" onClick={onRetry}>Try again</button>
        </div>
      )}
    </div>
  )
}

export function Skeleton({ lines = 3, height }: { lines?: number, height?: number }) {
  return (
    <div className="skeleton-group" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={height ? { height } : { width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  )
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return <span className="spinner" role="status" aria-label={label} />
}

export function TemplateFilter({ value, options, onChange }: { value: string, options: TemplateCount[] | undefined, onChange: (template: string) => void }) {
  const known = options?.some(option => option.template === value) ?? false
  return (
    <label className="field">
      <span>Template</span>
      <select className="select mono" value={value} disabled={!options && !value} onChange={event => onChange(event.target.value)}>
        <option value="">{options ? `All templates (${formatCount(options.length)})` : 'All templates'}</option>
        {value && !known && <option value={value}>{value}</option>}
        {options?.map(option => <option key={option.template} value={option.template}>{`${option.template} · ${formatCount(option.pages)}`}</option>)}
      </select>
    </label>
  )
}
