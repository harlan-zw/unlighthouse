import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useClient } from '../hooks.ts'
import { Link } from '../router.tsx'
import { useTheme, type ThemePreference } from '../theme.ts'
import type { Tone } from './controls.tsx'

export interface Crumb {
  label: string
  href?: string
}

function ThemeToggle() {
  const [theme, setTheme] = useTheme()
  const order: ThemePreference[] = ['system', 'light', 'dark']
  const next = order[(order.indexOf(theme) + 1) % order.length] ?? 'system'
  const label = `Theme: ${theme}. Switch to ${next}.`
  return (
    <button type="button" className="btn btn-ghost btn-icon" onClick={() => setTheme(next)} aria-label={label} title={label}>
      <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
        {theme === 'light' && <><circle cx="8" cy="8" r="3" /><path d="M8 1.5v1.5M8 13v1.5M1.5 8H3M13 8h1.5M3.4 3.4l1.06 1.06M11.54 11.54l1.06 1.06M3.4 12.6l1.06-1.06M11.54 4.46l1.06-1.06" /></>}
        {theme === 'dark' && <path d="M13.5 9.5A5.5 5.5 0 0 1 6.5 2.5a5.5 5.5 0 1 0 7 7Z" />}
        {theme === 'system' && <><rect x="1.5" y="2.5" width="13" height="9" rx="1" /><path d="M5.5 14h5M8 11.5V14" /><path d="M1.5 2.5h6.5v9H1.5Z" fill="currentColor" stroke="none" opacity="0.35" /></>}
      </svg>
    </button>
  )
}

export function TopBar({ crumbs, status, actions }: { crumbs: Crumb[], status?: ReactNode, actions?: ReactNode }) {
  const client = useClient()
  return (
    <header className="topbar">
      <nav className="crumbs" aria-label="Breadcrumb">
        <ol>
          {crumbs.map((crumb, i) => (
            <li key={`${crumb.label}-${i}`}>
              {crumb.href && i < crumbs.length - 1
                ? <Link to={crumb.href} className="truncate">{crumb.label}</Link>
                : <span aria-current={i === crumbs.length - 1 ? 'page' : undefined} className="truncate">{crumb.label}</span>}
            </li>
          ))}
        </ol>
        {status}
      </nav>
      <div className="topbar-right">
        {actions}
        {client.mode !== 'live' && <span className="mode-pill" title={client.mode === 'mock' ? 'Generated demo data' : 'Static snapshot'}>{client.mode}</span>}
        <ThemeToggle />
      </div>
    </header>
  )
}

export function Hero({ title, sub, aside }: { title: ReactNode, sub?: ReactNode, aside?: ReactNode }) {
  return (
    <section className="hero">
      <div className="hero-main">
        <h1>{title}</h1>
        {sub && <span className="hero-sub">{sub}</span>}
      </div>
      {aside}
    </section>
  )
}

export function CopyButton({ text, children, className = 'btn' }: { text: string, children: ReactNode, className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => {
    if (timer.current)
      clearTimeout(timer.current)
  }, [])
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
    }
    catch {
      return
    }
    setCopied(true)
    if (timer.current)
      clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button type="button" className={className} onClick={() => void copy()} aria-live="polite">
      {copied ? 'Copied' : children}
    </button>
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
