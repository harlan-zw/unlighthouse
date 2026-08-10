import { describe, expect, it } from 'vitest'
import { detectHttpProtection } from '../src/util/http-protection'

describe('detectHttpProtection', () => {
  it('identifies rate limits and preserves retry guidance', () => {
    const result = detectHttpProtection({
      status: 429,
      headers: new Headers({ 'retry-after': '60' }),
      body: 'Too many requests',
    })

    expect(result).toEqual({ _tag: 'RateLimited', retryAfterSeconds: 60 })
  })

  it('identifies Cloudflare managed challenges from headers', () => {
    const result = detectHttpProtection({
      status: 403,
      headers: new Headers({ 'cf-mitigated': 'challenge', 'server': 'cloudflare' }),
      body: '<html><title>Just a moment...</title></html>',
    })

    expect(result).toEqual({ _tag: 'CloudflareChallenge' })
  })

  it('does not classify an ordinary Cloudflare-served page as challenged', () => {
    const result = detectHttpProtection({
      status: 200,
      headers: new Headers({ server: 'cloudflare' }),
      body: '<html><title>Documentation</title></html>',
    })

    expect(result).toEqual({ _tag: 'None' })
  })
})
