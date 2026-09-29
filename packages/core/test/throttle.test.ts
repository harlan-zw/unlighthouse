import { describe, expect, it } from 'vitest'
import { resolveThrottling } from '../src/resolveConfig'

const method = (options: Parameters<typeof resolveThrottling>[1]) => resolveThrottling({}, options)?.throttlingMethod

describe('resolveThrottling', () => {
  it('simulates a slow network for a remote site by default', () => {
    expect(method({ site: 'https://example.com' })).toBe('simulate')
  })

  it('turns throttling off for a local site by default', () => {
    expect(method({ site: 'http://localhost:3000' })).toBe('provided')
    expect(method({ site: 'http://127.0.0.1:3000' })).toBe('provided')
    expect(method({ site: undefined })).toBe('provided')
  })

  it('explicit throttle wins over the site', () => {
    expect(method({ site: 'http://localhost:3000', throttle: true })).toBe('simulate')
    expect(method({ site: 'https://example.com', throttle: false })).toBe('provided')
  })

  it('explicit lighthouse throttling options win', () => {
    expect(resolveThrottling({ throttlingMethod: 'devtools' }, { site: 'https://example.com', throttle: false })).toBeUndefined()
  })
})
