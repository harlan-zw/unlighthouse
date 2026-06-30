// The `$api` command client throws plain `Error`s: `err.name` is the failure
// code (`HTTP_404`, a domain code, or `TypeError` when the network is down)
// and `err.message` is the human string. Parse that once, at the boundary,
// into a precise tagged shape so the UI can branch on *why* a read failed
// instead of collapsing every failure into an empty state.

export interface ApiError {
  /**
   * `offline`  — the backend is unreachable (show a connection banner).
   * `http`     — the server responded with an error status.
   * `unknown`  — anything else (parse error, thrown non-Error, …).
   */
  _tag: 'offline' | 'http' | 'unknown'
  /** HTTP status when known (`http` tag). */
  status?: number
  /** Stable machine code: `HTTP_404`, `OFFLINE`, a domain code, … */
  code: string
  /** Short heading for an alert/banner ("Server error", "Not found", …). */
  title: string
  /** Human-readable message, safe to surface in a toast / banner. */
  message: string
  /** Whether retrying the same request could plausibly succeed. */
  retryable: boolean
}

/** Short alert heading, mirroring nuxtseo.com's `titleForRpcError`. */
function titleForStatus(status: number | undefined): string {
  switch (status) {
    case 401: return 'Sign in required'
    case 403: return 'Permission denied'
    case 404: return 'Not found'
    case 429: return 'Too many requests'
    default:
      if (status != null && status >= 500)
        return 'Server error'
      return 'Request failed'
  }
}

function isNetworkError(err: Error): boolean {
  // Browsers reject `fetch` with a TypeError ("Failed to fetch" / "Load
  // failed" / "NetworkError…") when the host is unreachable, DNS fails, or
  // CORS blocks the request — none of which produced an HTTP response.
  return err.name === 'TypeError' || /failed to fetch|networkerror|load failed/i.test(err.message)
}

export function normalizeApiError(err: unknown): ApiError {
  if (!(err instanceof Error)) {
    return { _tag: 'unknown', code: 'ERROR', title: 'Something went wrong', message: String(err), retryable: false }
  }

  if (isNetworkError(err)) {
    return {
      _tag: 'offline',
      code: 'OFFLINE',
      title: 'Can\'t reach the backend',
      message: 'Cannot reach the Unlighthouse backend.',
      retryable: true,
    }
  }

  const typed = err as Error & {
    code?: unknown
    statusCode?: unknown
    retryable?: unknown
    suggestion?: unknown
  }
  if (typeof typed.code === 'string') {
    const status = typeof typed.statusCode === 'number' ? typed.statusCode : undefined
    return {
      _tag: 'http',
      status,
      code: typed.code,
      title: titleForStatus(status),
      message: err.message,
      retryable: typeof typed.retryable === 'boolean'
        ? typed.retryable
        : status != null && (status >= 500 || status === 429),
    }
  }

  if (err.name.startsWith('HTTP_')) {
    const status = Number(err.name.slice(5)) || undefined
    return {
      _tag: 'http',
      status,
      code: err.name,
      title: titleForStatus(status),
      message: err.message,
      retryable: status != null && (status >= 500 || status === 429),
    }
  }

  // A domain error code from the JSON body (`err.name` set, non-HTTP_).
  return {
    _tag: 'unknown',
    code: err.name || 'ERROR',
    title: 'Something went wrong',
    message: err.message,
    retryable: false,
  }
}
