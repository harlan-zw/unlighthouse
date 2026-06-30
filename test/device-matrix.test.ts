import { describe, expect, it } from 'vitest'
import { ScanStart } from '@unlighthouse/contracts/commands'
import { DeviceMatrixSchema, normaliseDeviceMatrix } from '@unlighthouse/contracts/types/atoms'

describe('device matrix contract', () => {
  it('normalises to a non-empty ordered matrix', () => {
    expect(normaliseDeviceMatrix(undefined)).toEqual(['mobile'])
    expect(normaliseDeviceMatrix(['desktop', 'mobile', 'desktop'])).toEqual(['desktop', 'mobile'])
  })

  it('rejects empty matrices at command boundaries', () => {
    expect(DeviceMatrixSchema.safeParse([]).success).toBe(false)
    expect(ScanStart.input.safeParse({ site: 'https://example.com', device: [] }).success).toBe(false)
    expect(ScanStart.input.safeParse({ site: 'https://example.com', device: ['mobile', 'desktop'] }).success).toBe(true)
  })
})
