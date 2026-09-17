import { describe, expect, it } from 'vitest'
import { isScoreBelowBudget } from '../src/ciBudget'

describe('ci score budgets', () => {
  it('fails a zero score below the configured budget', () => {
    expect(isScoreBelowBudget(0, 75)).toBe(true)
  })

  it('fails scores below the budget', () => {
    expect(isScoreBelowBudget(0.74, 75)).toBe(true)
  })

  it('allows scores at or above the budget', () => {
    expect(isScoreBelowBudget(0.75, 75)).toBe(false)
    expect(isScoreBelowBudget(1, 75)).toBe(false)
  })

  it('does not treat missing or non-finite scores as zero', () => {
    expect(isScoreBelowBudget(null, 75)).toBe(false)
    expect(isScoreBelowBudget(undefined, 75)).toBe(false)
    expect(isScoreBelowBudget(Number.NaN, 75)).toBe(false)
    expect(isScoreBelowBudget(Number.POSITIVE_INFINITY, 75)).toBe(false)
  })

  it('does not compare against a missing or non-finite budget', () => {
    expect(isScoreBelowBudget(0, undefined)).toBe(false)
    expect(isScoreBelowBudget(0, Number.NaN)).toBe(false)
  })
})
