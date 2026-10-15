import { createContext, useContext, useEffect, type ReactNode } from 'react'
import type { Tone } from './controls.tsx'

export interface Crumb {
  label: string
  href?: string
}

export const CrumbsContext = createContext<(crumbs: Crumb[]) => void>(() => {})

export function useBreadcrumbs(crumbs: Crumb[]): void {
  const set = useContext(CrumbsContext)
  const key = JSON.stringify(crumbs)
  useEffect(() => {
    set(JSON.parse(key) as Crumb[])
  }, [set, key])
}

export function PageHead({ eyebrow, title, meta, actions, titleClass }: { eyebrow?: ReactNode, title: ReactNode, meta?: ReactNode, actions?: ReactNode, titleClass?: string }) {
  return (
    <header className="page-head">
      <div className="page-head-main">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1 className={titleClass}>{title}</h1>
        {meta && <div className="page-head-meta">{meta}</div>}
      </div>
      {actions && <div className="page-head-actions">{actions}</div>}
    </header>
  )
}

export function Card({ title, hint, actions, children, flush, className, id }: { title?: ReactNode, hint?: ReactNode, actions?: ReactNode, children: ReactNode, flush?: boolean, className?: string, id?: string }) {
  return (
    <section className={`card${className ? ` ${className}` : ''}`} aria-labelledby={id && title ? `${id}-title` : undefined}>
      {(title || actions) && (
        <div className="card-header">
          <div className="row">
            {title && <h2 id={id ? `${id}-title` : undefined}>{title}</h2>}
            {hint && <span className="hint">{hint}</span>}
          </div>
          {actions && <div className="row">{actions}</div>}
        </div>
      )}
      <div className={`card-body${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  )
}

export function Callout({ tone = 'info', title, children }: { tone?: Tone, title?: ReactNode, children: ReactNode }) {
  return (
    <div className={`callout t-${tone}`} role={tone === 'poor' ? 'alert' : 'note'}>
      <svg className="callout-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {tone === 'info'
          ? <><circle cx="8" cy="8" r="6.5" /><path d="M8 7v4M8 5v.5" /></>
          : <><path d="M8 1.75 15 14H1Z" /><path d="M8 6.5v3.5M8 11.75v.5" /></>}
      </svg>
      <div>
        {title && <div className="callout-title">{title}</div>}
        {children}
      </div>
    </div>
  )
}

export function Stat({ label, value, sub }: { label: ReactNode, value: ReactNode, sub?: ReactNode }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  )
}
