export type ErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'INVALID_CONFIG'
  | 'SCAN_ACTIVE'
  | 'SCAN_NOT_RUNNING'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'AUDIT_FAILED'
  | 'CHROME_NOT_FOUND'
  | 'BUDGET_FAILED'

export class UnlighthouseError extends Error {
  readonly code: ErrorCode
  readonly details: unknown

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'UnlighthouseError'
    this.code = code
    this.details = details
  }
}

export function toErrorPayload(error: unknown): { code: ErrorCode | 'INTERNAL', message: string, details?: unknown } {
  if (error instanceof UnlighthouseError)
    return { code: error.code, message: error.message, details: error.details }
  return { code: 'INTERNAL', message: error instanceof Error ? error.message : String(error) }
}
