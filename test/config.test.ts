import { describe, expect, test } from 'bun:test'
import { mergeConfig, parseConfig } from '../src/config.ts'
import { UnlighthouseError } from '../src/errors.ts'

describe('config', () => {
  test('fills defaults for an empty config', () => {
    const config = parseConfig({ site: 'https://example.com' })
    expect(config.devices).toEqual(['mobile'])
    expect(config.categories).toContain('agentic-browsing')
    expect(config.discover.maxPages).toBe(500)
    expect(config.sampling.perTemplate).toBe(5)
    expect(config.budgets.scores).toEqual({})
  })

  test('rejects an unknown device with a readable error', () => {
    expect(() => parseConfig({ devices: ['tablet'] })).toThrow(UnlighthouseError)
  })

  test('merges nested objects and lets later values win', () => {
    const merged = mergeConfig({ discover: { maxPages: 10, links: true }, devices: ['mobile'] }, { discover: { maxPages: 50 }, devices: ['desktop'], site: undefined })
    expect(merged).toEqual({ discover: { maxPages: 50, links: true }, devices: ['desktop'] })
  })
})
