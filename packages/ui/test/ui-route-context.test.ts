import { describe, expect, it } from 'vitest'
import {
  optionalScanId,
  requireScanId,
  routeParamString,
} from '../app/features/scan/route-context'

describe('uI route contract parsing', () => {
  it('normalises Vue Router string and repeated params', () => {
    expect(routeParamString('scan-1')).toBe('scan-1')
    expect(routeParamString(['', 'scan-2'])).toBe('scan-2')
    expect(routeParamString(null)).toBeUndefined()
  })

  it('brands non-empty scan ids at the route boundary', () => {
    expect(optionalScanId('scan-1')).toBe('scan-1')
    expect(optionalScanId(undefined)).toBeUndefined()
    expect(requireScanId(['scan-2'])).toBe('scan-2')
  })

  it('rejects routes without a scan id', () => {
    expect(() => requireScanId('')).toThrow('Expected a non-empty scan id')
  })
})
