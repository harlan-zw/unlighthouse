import { describe, expect, it } from 'vitest'
import { isKnownDashboardPath } from '../src/server'

describe('dashboard SPA route status', () => {
  it.each([
    '/',
    '/onboarding',
    '/scan/new',
    '/scan/new?url=https%3A%2F%2Fexample.com%2F',
    '/sites/example.com',
    '/sites/example.com/compare',
    '/sites/example.com/compare?base=base-id&current=current-id',
    '/sites/example.com/scans/scan-id/overview',
    '/sites/example.com/scans/scan-id/routes',
    '/sites/example.com/scans/scan-id/route/%2Fblog',
    '/sites/example.com/scans/scan-id/packs/cwv',
  ])('recognizes %s', (path) => {
    expect(isKnownDashboardPath(path)).toBe(true)
  })

  it.each(['/missing', '/sites', '/scan', '/sites/example.com/nope'])('rejects %s', (path) => {
    expect(isKnownDashboardPath(path)).toBe(false)
  })
})
