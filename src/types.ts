export const DEVICES = ['mobile', 'desktop'] as const
export type Device = typeof DEVICES[number]

export const CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo', 'agentic-browsing'] as const
export type Category = typeof CATEGORIES[number]

export const METRICS = ['fcp', 'lcp', 'tbt', 'cls', 'si', 'ttfb'] as const
export type Metric = typeof METRICS[number]

export const RUNNERS = ['local', 'psi', 'cdp'] as const
export type RunnerKind = typeof RUNNERS[number]

export type ScanStatus = 'queued' | 'discovering' | 'auditing' | 'done' | 'cancelled' | 'failed'
export type PageStatus = 'queued' | 'running' | 'done' | 'failed' | 'skipped'
export type Severity = 'fail' | 'warn'

export type Scores = Record<Category, number | null>
export type Metrics = Record<Metric, number | null>

export interface Site {
  id: number
  origin: string
  createdAt: number
}

export interface ScanStats {
  discovered: number
  queued: number
  done: number
  failed: number
  skipped: number
}

export interface Scan {
  id: string
  siteId: number
  origin: string
  status: ScanStatus
  label: string | null
  branch: string | null
  commit: string | null
  devices: Device[]
  options: unknown
  stats: ScanStats
  lighthouseVersion: string | null
  error: string | null
  createdAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface Provenance {
  lighthouseVersion: string
  benchmarkIndex: number | null
  throttling: string
  concurrency: number
  samples: number
  spread: number | null
  warnings: string[]
  runner?: RunnerKind
}

export interface Page {
  scanId: string
  url: string
  path: string
  template: string
  device: Device
  status: PageStatus
  scores: Scores
  metrics: Metrics
  finalUrl: string | null
  statusCode: number | null
  provenance: Provenance | null
  error: string | null
  durationMs: number | null
  finishedAt: number | null
}

export interface Finding {
  auditId: string
  category: Category | null
  title: string
  severity: Severity
  score: number | null
  displayValue: string | null
  itemKey: string
  itemLabel: string | null
  savingsMs: number | null
  savingsBytes: number | null
}

export interface Issue {
  auditId: string
  category: Category | null
  title: string
  itemKey: string
  itemLabel: string | null
  severity: Severity
  pages: number
  devices: Device[]
  templates: string[]
  savingsMs: number
  savingsBytes: number
  impact: number
  examples: string[]
}

export const FIELD_METRICS = ['lcp', 'inp', 'cls', 'fcp', 'ttfb'] as const
export type FieldMetric = typeof FIELD_METRICS[number]

export type FieldSource = 'url' | 'origin'

export interface FieldHistogram {
  good: number
  needsImprovement: number
  poor: number
}

export interface FieldMetricValue {
  p75: number
  histogram: FieldHistogram
}

export interface FieldTrend {
  periods: string[]
  p75: Partial<Record<FieldMetric, Array<number | null>>>
}

export interface FieldRecord {
  key: string
  formFactor: 'PHONE' | 'DESKTOP'
  metrics: Partial<Record<FieldMetric, FieldMetricValue>>
  period: { first: string, last: string } | null
  trend?: FieldTrend
}

export interface PageField {
  source: FieldSource | null
  record: FieldRecord | null
}

export interface FieldCoverage {
  url: number
  origin: number
  none: number
}

export interface ScanField {
  fetchedAt: number | null
  origin: Partial<Record<Device, FieldRecord | null>>
  coverage: Partial<Record<Device, FieldCoverage>>
  pages: Array<{ url: string, device: Device, source: FieldSource | null }>
}

export const FLOW_METRICS = [...METRICS, 'inp'] as const
export type FlowMetric = typeof FLOW_METRICS[number]
export type FlowMetrics = Record<FlowMetric, number | null>

export const FLOW_STEP_MODES = ['navigation', 'timespan', 'snapshot'] as const
export type FlowStepMode = typeof FLOW_STEP_MODES[number]
export type FlowRunStatus = 'done' | 'failed'

export interface FlowStep {
  index: number
  name: string
  mode: FlowStepMode
  url: string
  scores: Scores
  metrics: FlowMetrics
  warnings: string[]
  findings: number
}

export interface FlowRun {
  scanId: string
  name: string
  device: Device
  status: FlowRunStatus
  startUrl: string
  lighthouseVersion: string | null
  error: string | null
  durationMs: number | null
  finishedAt: number
  steps: FlowStep[]
}

export type FlowStepDetail = Omit<FlowStep, 'findings'> & { findings: Finding[] }

export type FlowRunDetail = Omit<FlowRun, 'steps'> & { steps: FlowStepDetail[] }

export const NOTIFICATION_TYPES = ['webhook', 'slack', 'discord'] as const
export type NotificationType = typeof NOTIFICATION_TYPES[number]

export const NOTIFICATION_EVENTS = ['scan-done', 'scan-failed', 'regression', 'budget-failed', 'new-issues'] as const
export type NotificationEvent = typeof NOTIFICATION_EVENTS[number]

export type MonitorSource = 'config' | 'api'

export interface Schedule {
  id: string
  site: string
  cron: string
  devices: Device[] | null
  overrides: Record<string, unknown>
  enabled: boolean
  source: MonitorSource
  lastRunAt: number | null
  nextRunAt: number | null
  lastScanId: string | null
  lastError: string | null
  createdAt: number
  updatedAt: number
}

export interface NotificationChannel {
  id: string
  type: NotificationType
  url: string
  secret: string | null
  on: NotificationEvent[]
  sites: string[] | null
  source: MonitorSource
  createdAt: number
}

export interface Delivery {
  id: number
  notificationId: string
  scanId: string | null
  events: NotificationEvent[]
  status: 'sent' | 'failed'
  attempts: number
  httpStatus: number | null
  error: string | null
  createdAt: number
}
