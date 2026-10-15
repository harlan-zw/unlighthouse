import type { AuditResult } from '../contracts.ts'

export const JOB_FILE = 'job.json'
export const RESULT_FILE = 'result.json'
export const REPORT_FILE = 'report.json.gz'
export const THUMBNAIL_FILE = 'thumbnail.webp'
export const PROFILE_DIR = 'chrome-profile'
export const WORKER_DIR_PREFIX = 'unlighthouse-audit-'

export type FailureKind = 'infra' | 'page'

const PAGE_ERRORS = new Set([
  'NO_DOCUMENT_REQUEST',
  'FAILED_DOCUMENT_REQUEST',
  'ERRORED_DOCUMENT_REQUEST',
  'INSECURE_DOCUMENT_REQUEST',
  'CHROME_INTERSTITIAL_ERROR',
  'NOT_HTML',
  'DNS_FAILURE',
  'INVALID_URL',
  'PAGE_HUNG',
  'NO_FCP',
])

export function classifyLighthouseError(code: string): FailureKind {
  return PAGE_ERRORS.has(code) ? 'page' : 'infra'
}

export type WorkerOutcome =
  | { ok: true, result: Omit<AuditResult, 'report' | 'thumbnail'> }
  | { ok: false, kind: FailureKind, code: string, message: string }
