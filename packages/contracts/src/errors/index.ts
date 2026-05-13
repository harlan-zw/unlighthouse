// UnlighthouseError + stable code constants.
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
  /** Unrecoverable internal failure inside core orchestration. */
  INTERNAL: 'INTERNAL',
} as const

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes]

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
  INTERNAL: 'An unrecoverable internal error occurred.',
}

export interface UnlighthouseErrorInit {
  code: ErrorCode | (string & {})
  message: string
  suggestion?: string
  docsUrl?: string
  cause?: unknown
}

/**
 * Single error class. `.code` is the stable discriminant; callers branch on it.
 *
 *   if (err instanceof UnlighthouseError && err.code === 'QUOTA_EXCEEDED') …
 */
export class UnlighthouseError extends Error {
  readonly code: string
  readonly suggestion?: string
  readonly docsUrl?: string
  override readonly cause?: unknown

  constructor(init: UnlighthouseErrorInit) {
    super(init.message, { cause: init.cause })
    this.name = 'UnlighthouseError'
    this.code = init.code
    this.suggestion = init.suggestion
    this.docsUrl = init.docsUrl
    this.cause = init.cause
  }

  toJSON(): {
    code: string
    message: string
    suggestion?: string
    docsUrl?: string
    cause?: unknown
  } {
    return {
      code: this.code,
      message: this.message,
      suggestion: this.suggestion,
      docsUrl: this.docsUrl,
      cause: this.cause,
    }
  }
}

/** Type-narrowing helper. */
export function isUnlighthouseError(err: unknown): err is UnlighthouseError {
  return err instanceof UnlighthouseError
}
