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

type ErrorWithMetadata = Error & {
  code?: unknown
  statusCode?: unknown
  retryable?: unknown
  suggestion?: unknown
}

function errorChain(error: Error): Error[] {
  const chain: Error[] = []
  const seen = new Set<Error>()
  let current: Error | undefined = error
  while (current && !seen.has(current) && chain.length < 4) {
    chain.push(current)
    seen.add(current)
    current = current.cause instanceof Error ? current.cause : undefined
  }
  return chain
}

export function normalizeApiError(err: unknown): ApiError {
  if (!(err instanceof Error)) {
    return { _tag: 'unknown', code: 'ERROR', title: 'Something went wrong', message: String(err), retryable: false }
  }

  const chain = errorChain(err)
  const networkError = chain.find(isNetworkError)
  if (networkError) {
    return {
      _tag: 'offline',
      code: 'OFFLINE',
      title: 'Can\'t reach the backend',
      message: 'Cannot reach the Unlighthouse backend.',
      retryable: true,
    }
  }

  // Nuxt's useAsyncData passes failures through h3.createError(). When the
  // original client error comes from another bundled Error constructor, h3
  // wraps it and retains the typed UnlighthouseError in `cause`. Walk that
  // chain so domain code/status/retryability survive the query boundary.
  const typed = (chain.find((candidate) => {
    const meta = candidate as ErrorWithMetadata
    return typeof meta.code === 'string' || candidate.name.startsWith('HTTP_')
  }) ?? err) as ErrorWithMetadata
  const statusSource = chain.find(candidate => typeof (candidate as ErrorWithMetadata).statusCode === 'number') as ErrorWithMetadata | undefined
  const status = typeof typed.statusCode === 'number'
    ? typed.statusCode
    : typeof statusSource?.statusCode === 'number' ? statusSource.statusCode : undefined
  const typedCode = typeof typed.code === 'string'
    ? typed.code
    : typed.name.startsWith('HTTP_') ? typed.name : status != null ? `HTTP_${status}` : undefined

  if (typedCode) {
    return {
      _tag: 'http',
      status,
      code: typedCode,
      title: titleForStatus(status),
      message: typed.message || err.message,
      retryable: typeof typed.retryable === 'boolean'
        ? typed.retryable
        : status != null && (status >= 500 || status === 429),
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
