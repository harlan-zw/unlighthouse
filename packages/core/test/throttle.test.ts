import { describe, expect, it } from 'vitest'
import { resolveThrottling } from '../src/resolveConfig'

describe('resolveThrottling', () => {
  it('throttle false turns throttling off', () => {
    expect(resolveThrottling({}, false)?.throttlingMethod).toBe('provided')
  })

  it('throttle true simulates a slow network', () => {
    expect(resolveThrottling({}, true)?.throttlingMethod).toBe('simulate')
  })

  it('explicit lighthouse throttling options win', () => {
    expect(resolveThrottling({ throttlingMethod: 'devtools' }, false)).toBeUndefined()
  })
})
