import { describe, expect, it } from 'vitest'
import { isNewerVersion } from '../src/util/version'

describe('version comparison', () => {
  it('compares stable version segments', () => {
    expect(isNewerVersion('v1.10.0', '1.2.0')).toBe(true)
    expect(isNewerVersion('v1.2.10', '1.2.9')).toBe(true)
    expect(isNewerVersion('v1.0.0', '0.18.0')).toBe(true)
    expect(isNewerVersion('v1.2.0', '1.2.0')).toBe(false)
    expect(isNewerVersion('v1.2', '1.2.0')).toBe(false)
    expect(isNewerVersion('v1.2.0', '1.2.1')).toBe(false)
  })
})
