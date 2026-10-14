import { describe, expect, it } from 'vitest'
import { groupPageAudits } from '../app/features/scan/audit-presentation'

function audit(id: string, scoreDisplayMode: string, score: number | null, severity: string | null = 'pass') {
  return { id, scoreDisplayMode, score, severity }
}

describe('page audit groups', () => {
  it('keeps failed savings insights visible even when legacy severity says pass', () => {
    const groups = groupPageAudits({ image: audit('image', 'metricSavings', 0) }, [{ id: 'image' }])
    expect(groups.failing.map(a => a.id)).toEqual(['image'])
    expect(groups.passing).toEqual([])
  })

  it('keeps manual review distinct from not applicable results', () => {
    const groups = groupPageAudits({ manual: audit('manual', 'manual', null), na: audit('na', 'notApplicable', null) }, [{ id: 'manual' }, { id: 'na' }])
    expect(groups.manual.map(a => a.id)).toEqual(['manual'])
    expect(groups.notApplicable.map(a => a.id)).toEqual(['na'])
  })

  it('keeps errors, information, and unknown results outside passed audits', () => {
    const audits = { error: audit('error', 'error', null), info: audit('info', 'informative', 1), unknown: audit('unknown', 'unknown', null) }
    const groups = groupPageAudits(audits, Object.keys(audits).map(id => ({ id })))
    expect(groups.passing).toEqual([])
    expect(groups.errors.map(a => a.id)).toEqual(['error'])
    expect(groups.informative.map(a => a.id)).toEqual(['info'])
    expect(groups.unknown.map(a => a.id)).toEqual(['unknown'])
  })

  it('excludes hidden diagnostics and leaves a null numeric result unknown', () => {
    const groups = groupPageAudits({ hidden: audit('hidden', 'numeric', 1), missing: audit('missing', 'numeric', null) }, [{ id: 'hidden', group: 'hidden' }, { id: 'missing' }])
    expect(groups.passing).toEqual([])
    expect(groups.unknown.map(a => a.id)).toEqual(['missing'])
  })
})
