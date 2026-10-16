import type { Config, LighthouseOptions, RunnerConfig } from './config.ts'
import type { Category, Delivery, Device, FieldRecord, FieldSource, Finding, FlowMetrics, FlowRun, FlowRunDetail, FlowStepMode, Issue, IssueItem, Metrics, NotificationChannel, NotificationEvent, Page, PageField, PageStatus, Provenance, Scan, ScanField, ScanStats, ScanStatus, Schedule, Scores, Site } from './types.ts'

export interface Cookie {
  name: string
  value: string
  domain?: string
  path?: string
}

export interface AuthState {
  headers: Record<string, string>
  cookies: Cookie[]
  localStorage: Record<string, string>
  sessionStorage: Record<string, string>
}

export interface FetchedPage {
  url: string
  finalUrl: string
  status: number
  contentType: string | null
  html: string | null
}

export type FetchPage = (url: string, signal?: AbortSignal) => Promise<FetchedPage>

export interface DiscoveredPage {
  url: string
  path: string
  template: string
  locale: string | null
  alternateOf: string | null
  skipReason: string | null
}

export type HreflangProblemKind = 'invalid-code' | 'broken-target' | 'redirected-target' | 'missing-return-link'

export interface HreflangProblem {
  url: string
  hreflang: string
  target: string
  problem: HreflangProblemKind
}

export interface BrokenLink {
  url: string
  status: number
  from: string
}

export interface DiscoverResult {
  origin: string
  pages: DiscoveredPage[]
  broken: BrokenLink[]
  hreflangProblems: HreflangProblem[]
  blockedByRobots: number
  crawlDelayMs: number | null
}

export interface DiscoverOptions {
  fetchPage?: FetchPage
  signal?: AbortSignal
  onFound?: (page: { url: string, depth: number }) => void
}

export type Discover = (config: Config & { site: string }, options?: DiscoverOptions) => Promise<DiscoverResult>

export interface AuditJob {
  url: string
  device: Device
  categories: Category[]
  throttling: Config['throttling']
  samples: number
  timeoutMs: number
  concurrency: number
  userAgent?: string
  chromePath?: string
  chromeFlags: string[]
  auth: AuthState
  lighthouse?: LighthouseOptions
  runner?: RunnerConfig
  cwd?: string
}

export interface AuditResult {
  finalUrl: string
  statusCode: number | null
  scores: Scores
  metrics: Metrics
  provenance: Provenance
  findings: Finding[]
  report: Uint8Array
  thumbnail: Uint8Array | null
  durationMs: number
}

export interface AuditPool {
  readonly size: number
  run(job: AuditJob, signal?: AbortSignal): Promise<AuditResult>
  close(): Promise<void>
}

export interface Renderer {
  fetchPage: FetchPage
  close(): Promise<void>
}

export interface Paged<T> {
  items: T[]
  total: number
}

export interface PageQuery {
  scanId: string
  device?: Device
  template?: string
  status?: PageStatus
  search?: string
  sort?: Category | keyof Metrics | 'url' | 'template'
  order?: 'asc' | 'desc'
  limit: number
  offset: number
}

export interface IssueQuery {
  scanId: string
  auditId?: string
  category?: Category
  device?: Device
  template?: string
  limit: number
  offset: number
}

export interface IssuePage {
  url: string
  device: Device
  template: string
  items: number
  savingsMs: number | null
  savingsBytes: number | null
  displayValue: string | null
}

export interface IssueDetail {
  issue: Issue
  items: IssueItem[]
  pages: IssuePage[]
}

export interface TemplateCount {
  template: string
  pages: number
}

export interface NewScan {
  origin: string
  devices: Device[]
  options: unknown
  label?: string
  branch?: string
  commit?: string
}

export interface NewPage {
  url: string
  path: string
  template: string
  device: Device
  status: PageStatus
  reason?: string
}

export type ScanPatch = Partial<{
  status: ScanStatus
  stats: ScanStats
  lighthouseVersion: string
  error: string | null
  startedAt: number
  finishedAt: number
  brokenLinks: BrokenLink[]
  hreflangProblems: HreflangProblem[]
}>

export interface FieldResult {
  origin: Partial<Record<Device, FieldRecord | null>>
  pages: Array<{ url: string, device: Device, source: FieldSource | null, record: FieldRecord | null }>
}

export type SchedulePatch = Partial<Pick<Schedule, 'lastRunAt' | 'nextRunAt' | 'lastScanId' | 'lastError'>>

export interface NewDelivery {
  notificationId: string
  scanId: string | null
  events: NotificationEvent[]
  status: Delivery['status']
  attempts: number
  httpStatus: number | null
  error: string | null
}

export interface MonitorStore {
  listSchedules(): Schedule[]
  getSchedule(id: string): Schedule | null
  saveSchedule(schedule: Schedule): void
  patchSchedule(id: string, patch: SchedulePatch): void
  deleteSchedule(id: string): boolean
  listNotifications(): NotificationChannel[]
  getNotification(id: string): NotificationChannel | null
  saveNotification(channel: NotificationChannel): void
  deleteNotification(id: string): boolean
  logDelivery(entry: NewDelivery): Delivery
  listDeliveries(query: { notificationId?: string, scanId?: string, limit: number, offset: number }): Paged<Delivery>
}

export interface Store extends MonitorStore {
  close(): void
  upsertSite(origin: string): Site
  listSites(): Array<Site & { scans: number, lastScan: Scan | null }>
  createScan(input: NewScan): Scan
  getScan(id: string): Scan | null
  listScans(query: { origin?: string, status?: ScanStatus, limit: number, offset: number }): Paged<Scan>
  updateScan(id: string, patch: ScanPatch): void
  deleteScan(id: string): void
  brokenLinks(scanId: string): BrokenLink[]
  hreflangProblems(scanId: string): HreflangProblem[]
  findBaseline(query: { origin: string, devices: Device[], branch?: string, excludeId: string, before: number }): Scan | null
  insertPages(scanId: string, pages: NewPage[]): void
  setPageStatus(scanId: string, url: string, device: Device, status: PageStatus, error?: string | null): void
  queueRescan(scanId: string, url: string, device: Device): PageStatus
  interruptedRescans(): Array<{ scanId: string, url: string, device: Device, previous: PageStatus | null }>
  savePageResult(scanId: string, url: string, device: Device, result: AuditResult): void
  getPage(scanId: string, url: string, device: Device): Page | null
  listPages(query: PageQuery): Paged<Page>
  allPages(scanId: string): Page[]
  templates(scanId: string): TemplateCount[]
  findings(scanId: string, url: string, device: Device): Finding[]
  listIssues(query: IssueQuery): Paged<Issue>
  issueItems(scanId: string, auditId: string): IssueItem[]
  issuePages(scanId: string, auditId: string): IssuePage[]
  getReport(scanId: string, url: string, device: Device): Uint8Array | null
  getThumbnail(scanId: string, url: string, device: Device): Uint8Array | null
  pruneScans(origin: string, keep: number): string[]
  cruxCacheGet(key: string, maxAgeMs: number): { value: unknown } | null
  cruxCachePut(key: string, value: unknown): void
  saveField(scanId: string, field: FieldResult): void
  pageField(scanId: string, url: string, device: Device): PageField | null
  scanField(scanId: string): ScanField | null
  saveFlowResult(scanId: string, result: FlowRunResult): void
  saveFlowFailure(scanId: string, failure: FlowFailure): void
  listFlowRuns(scanId: string): FlowRun[]
  getFlowRun(scanId: string, name: string, device: Device): FlowRunDetail | null
  getFlowReport(scanId: string, name: string, device: Device): Uint8Array | null
}

export interface FlowJob {
  name: string
  module: string
  url: string
  device: Device
  categories: Category[]
  throttling: Config['throttling']
  timeoutMs: number
  userAgent?: string
  chromePath?: string
  chromeFlags: string[]
  auth: AuthState
}

export interface FlowStepResult {
  name: string
  mode: FlowStepMode
  url: string
  scores: Scores
  metrics: FlowMetrics
  findings: Finding[]
  warnings: string[]
}

export interface FlowRunResult {
  name: string
  device: Device
  startUrl: string
  lighthouseVersion: string
  steps: FlowStepResult[]
  report: Uint8Array
  durationMs: number
}

export interface FlowFailure {
  name: string
  device: Device
  startUrl: string
  error: string
  durationMs: number | null
}

export type RunFlow = (job: FlowJob, signal?: AbortSignal) => Promise<FlowRunResult>
