import { z } from 'zod'

// UnlighthouseError + stable code/default/envelope registry.
// See v1.md §"Cross-cutting concerns" → Errors row, and D-019c.
// One class, `.code: string` discriminant. No class hierarchy.

/**
 * Stable error codes. CLI surfaces map these to exit codes.
 * Adding a code is SemVer-minor; renaming or removing one is SemVer-major.
 */
export const ErrorCodes = {
  /** Adapter does not implement the requested capability (e.g. pause on cloudflare-crawl). */
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  /** Host quota counter denied the audit. Payload includes `bucket`. */
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  /** `core.run()` called while a session is already in flight. */
  ACTIVE_SCAN_CONFLICT: 'ACTIVE_SCAN_CONFLICT',
  /** Zod validation of UnlighthouseConfig failed at factory time. */
  CONFIG_INVALID: 'CONFIG_INVALID',
  /** No scan row found for the supplied scanId. */
  SCAN_NOT_FOUND: 'SCAN_NOT_FOUND',
  /** No route row found for the (scanId, url) pair. */
  ROUTE_NOT_FOUND: 'ROUTE_NOT_FOUND',
  /** Command input failed schema validation. */
  INPUT_INVALID: 'INPUT_INVALID',
  /** Assertion(s) evaluated to false; CI / `audit` exits non-zero. */
  ASSERTION_FAILED: 'ASSERTION_FAILED',
  /** A previous scan to compare against could not be found. */
  COMPARE_BASELINE_MISSING: 'COMPARE_BASELINE_MISSING',
  /** Scan was cancelled (via signal or `scan.cancel`). */
  SCAN_CANCELLED: 'SCAN_CANCELLED',
  /** HTTP/API caller exceeded a retryable transport or quota limit. */
  RATE_LIMITED: 'RATE_LIMITED',
  /** Transient infrastructure failure; callers may retry. */
  INFRA_RETRYABLE: 'INFRA_RETRYABLE',
  /** Scan runner could not delegate a route audit to the active worker. */
  AUDIT_DELEGATION_FAILED: 'AUDIT_DELEGATION_FAILED',
  /** Required route artifact could not be written. */
  ROUTE_ARTIFACT_WRITE_FAILED: 'ROUTE_ARTIFACT_WRITE_FAILED',
  /** Unrecoverable internal failure inside core orchestration. */
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

export type ErrorCategory = 'fatal' | 'route-failed' | 'retryable' | 'validation'

export interface ErrorCodeDefaults {
  statusCode: number
  message: string
  category: ErrorCategory
  retryable?: boolean
}

/**
 * Human-readable descriptions, surfaced by `manifest` and `--help`.
 */
export const ErrorCodeDescriptions: Record<ErrorCode, string> = {
  NOT_SUPPORTED: 'The active adapter does not support this capability.',
  QUOTA_EXCEEDED: 'A configured rate-limit bucket denied the operation.',
  ACTIVE_SCAN_CONFLICT: 'A scan is already in flight on this Core instance.',
  CONFIG_INVALID: 'The supplied UnlighthouseConfig failed schema validation.',
  SCAN_NOT_FOUND: 'No scan was found for the supplied scanId.',
  ROUTE_NOT_FOUND: 'No route was found for the supplied scanId + url.',
  INPUT_INVALID: 'Command input failed schema validation.',
  ASSERTION_FAILED: 'One or more assertions evaluated to false.',
  COMPARE_BASELINE_MISSING: 'No previous scan was available to compare against.',
  SCAN_CANCELLED: 'The scan was cancelled before completion.',
  RATE_LIMITED: 'The request exceeded a rate limit.',
  INFRA_RETRYABLE: 'A transient infrastructure dependency failed.',
  AUDIT_DELEGATION_FAILED: 'The scan runner could not delegate an audit to the worker.',
  ROUTE_ARTIFACT_WRITE_FAILED: 'A required route artifact could not be stored.',
  INTERNAL: 'An unrecoverable internal error occurred.',
}

const DEFAULTS = new Map<string, ErrorCodeDefaults>([
  [ErrorCodes.NOT_SUPPORTED, { statusCode: 501, message: ErrorCodeDescriptions.NOT_SUPPORTED, category: 'fatal' }],
  [ErrorCodes.QUOTA_EXCEEDED, { statusCode: 429, message: ErrorCodeDescriptions.QUOTA_EXCEEDED, category: 'retryable', retryable: true }],
  [ErrorCodes.ACTIVE_SCAN_CONFLICT, { statusCode: 409, message: ErrorCodeDescriptions.ACTIVE_SCAN_CONFLICT, category: 'fatal' }],
  [ErrorCodes.CONFIG_INVALID, { statusCode: 400, message: ErrorCodeDescriptions.CONFIG_INVALID, category: 'validation' }],
  [ErrorCodes.SCAN_NOT_FOUND, { statusCode: 404, message: ErrorCodeDescriptions.SCAN_NOT_FOUND, category: 'fatal' }],
  [ErrorCodes.ROUTE_NOT_FOUND, { statusCode: 404, message: ErrorCodeDescriptions.ROUTE_NOT_FOUND, category: 'fatal' }],
  [ErrorCodes.INPUT_INVALID, { statusCode: 400, message: ErrorCodeDescriptions.INPUT_INVALID, category: 'validation' }],
  [ErrorCodes.ASSERTION_FAILED, { statusCode: 422, message: ErrorCodeDescriptions.ASSERTION_FAILED, category: 'fatal' }],
  [ErrorCodes.COMPARE_BASELINE_MISSING, { statusCode: 404, message: ErrorCodeDescriptions.COMPARE_BASELINE_MISSING, category: 'fatal' }],
  [ErrorCodes.SCAN_CANCELLED, { statusCode: 409, message: ErrorCodeDescriptions.SCAN_CANCELLED, category: 'fatal' }],
  [ErrorCodes.RATE_LIMITED, { statusCode: 429, message: ErrorCodeDescriptions.RATE_LIMITED, category: 'retryable', retryable: true }],
  [ErrorCodes.INFRA_RETRYABLE, { statusCode: 503, message: ErrorCodeDescriptions.INFRA_RETRYABLE, category: 'retryable', retryable: true }],
  [ErrorCodes.AUDIT_DELEGATION_FAILED, { statusCode: 502, message: ErrorCodeDescriptions.AUDIT_DELEGATION_FAILED, category: 'route-failed', retryable: true }],
  [ErrorCodes.ROUTE_ARTIFACT_WRITE_FAILED, { statusCode: 500, message: ErrorCodeDescriptions.ROUTE_ARTIFACT_WRITE_FAILED, category: 'route-failed' }],
  [ErrorCodes.INTERNAL, { statusCode: 500, message: ErrorCodeDescriptions.INTERNAL, category: 'fatal' }],
])

export function registerErrorCodeDefaults(code: ErrorCode | (string & {}), defaults: ErrorCodeDefaults): void {
  DEFAULTS.set(code, defaults)
}

export function getErrorCodeDefaults(code: string): ErrorCodeDefaults {
  return DEFAULTS.get(code) ?? DEFAULTS.get(ErrorCodes.INTERNAL)!
}

export function statusForErrorCode(code: string): number {
  return getErrorCodeDefaults(code).statusCode
}

export interface UnlighthouseErrorInit {
  code: ErrorCode | (string & {})
  message?: string
  statusCode?: number
  suggestion?: string
  docsUrl?: string
  details?: Record<string, unknown>
  retryable?: boolean
  cause?: unknown
}

/**
 * Single error class. `.code` is the stable discriminant; callers branch on it.
 *
 *   if (err instanceof UnlighthouseError && err.code === 'QUOTA_EXCEEDED') …
 */
export class UnlighthouseError extends Error {
  readonly code: string
  readonly statusCode: number
  readonly category: ErrorCategory
  readonly suggestion?: string
  readonly docsUrl?: string
  readonly details?: Record<string, unknown>
  readonly retryable: boolean
  override readonly cause?: unknown

  constructor(init: UnlighthouseErrorInit) {
    const defaults = getErrorCodeDefaults(init.code)
    super(init.message ?? defaults.message, { cause: init.cause })
    this.name = 'UnlighthouseError'
    this.code = init.code
    this.statusCode = init.statusCode ?? defaults.statusCode
    this.category = defaults.category
    this.suggestion = init.suggestion
    this.docsUrl = init.docsUrl
    this.details = init.details
    this.retryable = init.retryable ?? defaults.retryable ?? false
    this.cause = init.cause
  }

  toJSON(): {
    code: string
    message: string
    statusCode: number
    category: ErrorCategory
    suggestion?: string
    docsUrl?: string
    details?: Record<string, unknown>
    retryable?: boolean
    cause?: unknown
  } {
    return {
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      category: this.category,
      suggestion: this.suggestion,
      docsUrl: this.docsUrl,
      details: this.details,
      retryable: this.retryable || undefined,
      cause: this.cause,
    }
  }
}

/** Type-narrowing helper. */
export function isUnlighthouseError(err: unknown): err is UnlighthouseError {
  return err instanceof UnlighthouseError
}

export interface UnlighthouseErrorEnvelopeError {
  code: string
  message: string
  statusCode: number
  category: ErrorCategory
  retryable?: boolean
  suggestion?: string
  docsUrl?: string
  details?: Record<string, unknown>
  /**
   * Compatibility with pre-envelope validation responses. New callers should
   * read `details.issues`.
   */
  issues?: unknown
}

export interface UnlighthouseErrorEnvelope {
  error: UnlighthouseErrorEnvelopeError
}

export const UnlighthouseErrorPayloadSchema = z.object({
  code: z.string(),
  message: z.string(),
  statusCode: z.number().int().min(100).max(599),
  category: z.enum(['fatal', 'route-failed', 'retryable', 'validation']),
  retryable: z.boolean().optional(),
  suggestion: z.string().optional(),
  docsUrl: z.url().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
  issues: z.unknown().optional(),
})

export const UnlighthouseErrorEnvelopeSchema = z.object({
  error: UnlighthouseErrorPayloadSchema,
})

export interface ErrorEnvelopeOptions {
  /**
   * Include non-domain Error messages in the envelope. Keep false in
   * production so internal stack messages do not leak to users.
   */
  exposeInternal?: boolean
  fallbackCode?: ErrorCode | (string & {})
  details?: Record<string, unknown>
}

export function toUnlighthouseError(err: unknown, opts: ErrorEnvelopeOptions = {}): UnlighthouseError {
  if (err instanceof UnlighthouseError)
    return err
  const code = opts.fallbackCode ?? ErrorCodes.INTERNAL
  const message = opts.exposeInternal && err instanceof Error
    ? err.message
    : undefined
  return new UnlighthouseError({
    code,
    message,
    details: opts.details,
    cause: err,
  })
}

export function createErrorEnvelope(err: unknown, opts: ErrorEnvelopeOptions = {}): UnlighthouseErrorEnvelope {
  const normalized = toUnlighthouseError(err, opts)
  const details = normalized.details ?? opts.details
  const validationIssues = details && 'issues' in details ? details.issues : undefined
  return {
    error: {
      code: normalized.code,
      message: normalized.message,
      statusCode: normalized.statusCode,
      category: normalized.category,
      retryable: normalized.retryable || undefined,
      suggestion: normalized.suggestion,
      docsUrl: normalized.docsUrl,
      details,
      issues: validationIssues,
    },
  }
}

export function isErrorEnvelope(value: unknown): value is UnlighthouseErrorEnvelope {
  if (!value || typeof value !== 'object')
    return false
  const error = (value as { error?: unknown }).error
  return !!error
    && typeof error === 'object'
    && typeof (error as { code?: unknown }).code === 'string'
    && typeof (error as { message?: unknown }).message === 'string'
}

export function errorFromEnvelope(envelope: UnlighthouseErrorEnvelope): UnlighthouseError {
  const error = envelope.error
  return new UnlighthouseError({
    code: error.code,
    message: error.message,
    statusCode: error.statusCode,
    retryable: error.retryable,
    suggestion: error.suggestion,
    docsUrl: error.docsUrl,
    details: error.details,
  })
}
