import type { ReliabilityWarning } from '../analysis/summary.ts'
import { rateMetric, scoreBand } from '../analysis/thresholds.ts'
import type { Category, Device, Metric } from '../types.ts'

export type Rating = 'good' | 'average' | 'poor' | 'none'

export const CATEGORY_LABELS: Record<Category, string> = {
  'performance': 'Performance',
  'accessibility': 'Accessibility',
  'best-practices': 'Best practices',
  'seo': 'SEO',
  'agentic-browsing': 'Agentic browsing',
}

export const CATEGORY_SHORT: Record<Category, string> = {
  'performance': 'Perf',
  'accessibility': 'A11y',
  'best-practices': 'BP',
  'seo': 'SEO',
  'agentic-browsing': 'Agent',
}

export const METRIC_LABELS: Record<Metric, string> = {
  fcp: 'First Contentful Paint',
  lcp: 'Largest Contentful Paint',
  tbt: 'Total Blocking Time',
  cls: 'Cumulative Layout Shift',
  si: 'Speed Index',
  ttfb: 'Time to First Byte',
}

export const METRIC_SHORT: Record<Metric, string> = {
  fcp: 'FCP',
  lcp: 'LCP',
  tbt: 'TBT',
  cls: 'CLS',
  si: 'SI',
  ttfb: 'TTFB',
}

export const RATING_LABELS: Record<Rating, string> = {
  good: 'good',
  average: 'needs improvement',
  poor: 'poor',
  none: 'not measured',
}

export function scoreRating(score: number | null | undefined): Rating {
  if (score === null || score === undefined || Number.isNaN(score))
    return 'none'
  return scoreBand(score)
}

export function metricRating(metric: Metric, value: number | null | undefined, device: Device): Rating {
  if (value === null || value === undefined || Number.isNaN(value))
    return 'none'
  const rating = rateMetric(metric, value, device)
  return rating === 'needs-improvement' ? 'average' : rating
}

export function formatScore(score: number | null | undefined): string {
  if (score === null || score === undefined || Number.isNaN(score))
    return '—'
  return String(Math.round(score * 100))
}

export function formatMs(ms: number): string {
  if (Math.abs(ms) < 1000)
    return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(1)} s`
}

export function formatMetric(metric: Metric, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value))
    return '—'
  if (metric === 'cls')
    return value < 0.001 && value > 0 ? '<0.001' : value.toFixed(3).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '')
  return formatMs(value)
}

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || bytes <= 0)
    return '—'
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KiB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MiB`
}

export function formatPercent(share: number | null | undefined): string {
  if (share === null || share === undefined || Number.isNaN(share))
    return '—'
  return `${Math.round(share * 100)}%`
}

export function formatCount(value: number): string {
  return new Intl.NumberFormat('en').format(value)
}

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })

export function formatRelative(ts: number | null | undefined, now = Date.now()): string {
  if (!ts)
    return '—'
  const diff = (ts - now) / 1000
  const abs = Math.abs(diff)
  if (abs < 45)
    return 'just now'
  if (abs < 3600)
    return relative.format(Math.round(diff / 60), 'minute')
  if (abs < 86400)
    return relative.format(Math.round(diff / 3600), 'hour')
  if (abs < 86400 * 30)
    return relative.format(Math.round(diff / 86400), 'day')
  return formatDate(ts)
}

export function formatDate(ts: number | null | undefined): string {
  if (!ts)
    return '—'
  return new Date(ts).toLocaleString('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined)
    return '—'
  const s = Math.round(ms / 1000)
  if (s < 60)
    return `${s}s`
  const m = Math.floor(s / 60)
  if (m < 60)
    return `${m}m ${s % 60}s`
  return `${Math.floor(m / 60)}h ${m % 60}m`
}

export function hostOf(origin: string): string {
  try {
    return new URL(origin).host
  }
  catch {
    return origin
  }
}

export function pathOf(url: string): string {
  try {
    const u = new URL(url)
    return u.pathname + u.search
  }
  catch {
    return url
  }
}

export function formatWhen(ts: number | null | undefined, now = Date.now()): string {
  if (!ts)
    return '—'
  const midnight = (value: number) => new Date(value).setHours(0, 0, 0, 0)
  const days = Math.round((midnight(now) - midnight(ts)) / 86_400_000)
  if (days <= 0)
    return `today ${new Date(ts).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit', hour12: false })}`
  if (days === 1)
    return 'yesterday'
  if (days < 30)
    return `${days} days ago`
  return formatDate(ts)
}

export function shortCommit(commit: string | null): string | null {
  return commit ? commit.slice(0, 7) : null
}

export function reliabilityText(warning: ReliabilityWarning): string {
  switch (warning.code) {
    case 'failed-pages': return `${warning.pages} pages failed`
    case 'high-sample-spread': return `${warning.pages} pages with high sample spread`
    case 'low-benchmark-index': return `Low benchmark index on ${warning.pages} pages`
    case 'concurrent-simulated-throttling': return 'Parallel audits with simulated throttling'
    case 'mixed-lighthouse-versions': return 'Mixed Lighthouse versions'
    case 'remote-runner': return 'Remote runner'
  }
}

const TINTS = ['#8B93FF', '#4CC38A', '#F2B84B', '#C3C6CD', '#F2785C', '#7FD3A6']

export function siteTint(host: string): string {
  let h = 0
  for (const char of host)
    h = (h * 31 + char.charCodeAt(0)) >>> 0
  return TINTS[h % TINTS.length] ?? '#8B93FF'
}

export function plural(count: number, noun: string): string {
  return `${formatCount(count)} ${count === 1 ? noun : `${noun}s`}`
}
