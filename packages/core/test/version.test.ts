import { describe, expect, it } from 'vitest'
import { isNewerVersion } from '../src/util/version'

describe('isNewerVersion', () => {
  it('handles a leading v prefix and compares minor versions', () => {
    expect(isNewerVersion('v1.10.0', '1.2.0')).toBe(true)
  })

  it('compares multi-digit patch versions', () => {
    expect(isNewerVersion('v1.2.10', '1.2.9')).toBe(true)
  })

  it('compares major versions before minor versions', () => {
    expect(isNewerVersion('v1.0.0', '0.18.0')).toBe(true)
  })

  it('returns false for equal versions', () => {
    expect(isNewerVersion('v1.2.0', '1.2.0')).toBe(false)
  })

  it('treats missing segments as zero', () => {
    expect(isNewerVersion('v1.2', '1.2.0')).toBe(false)
  })

  it('returns false when the latest version is older', () => {
    expect(isNewerVersion('v1.2.0', '1.2.1')).toBe(false)
  })
})
