export type HttpProtection
  = | { _tag: 'None' }
    | { _tag: 'RateLimited', retryAfterSeconds: number | null }
    | { _tag: 'CloudflareChallenge' }

export interface HttpProtectionInput {
  status: number
  headers: Headers
  body: string
}

const CLOUDFLARE_CHALLENGE_RE = /cdn-cgi\/challenge-platform|cf-chl-|cf-browser-verification|challenge-error-text|attention required!\s*\|\s*cloudflare/i

function retryAfterSeconds(value: string | null): number | null {
  if (!value)
    return null
  const seconds = Number(value)
  if (Number.isFinite(seconds))
    return Math.max(0, Math.ceil(seconds))
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, Math.ceil((date - Date.now()) / 1_000))
}

/** Detect fetch refusal signals before HTML is trusted as a real site page. */
export function detectHttpProtection(input: HttpProtectionInput): HttpProtection {
  const retryAfter = input.headers.get('retry-after')
  if (input.status === 429 || (input.status === 503 && retryAfter)) {
    return {
      _tag: 'RateLimited',
      retryAfterSeconds: retryAfterSeconds(retryAfter),
    }
  }

  if (input.headers.get('cf-mitigated')?.toLowerCase() === 'challenge')
    return { _tag: 'CloudflareChallenge' }

  const servedByCloudflare = input.headers.get('server')?.toLowerCase().includes('cloudflare')
    || input.headers.has('cf-ray')
  if (servedByCloudflare && CLOUDFLARE_CHALLENGE_RE.test(input.body))
    return { _tag: 'CloudflareChallenge' }

  return { _tag: 'None' }
}
