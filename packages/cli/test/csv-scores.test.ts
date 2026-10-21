import type { UnlighthouseRouteReport } from '../src/types'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { generateReportPayload, outputReport } from '../src/reporters'

// null is a supported category score. Missing and non-finite values are defensive
// runtime cases; these fixtures do not widen the public report types.
const scores = [
  { name: 'zero', value: 0, cell: '0' },
  { name: 'fraction', value: 0.745, cell: '75' },
  { name: 'one', value: 1, cell: '100' },
  { name: 'null', value: null, cell: '""' },
  { name: 'undefined', value: undefined, cell: '""' },
  { name: 'NaN', value: Number.NaN, cell: '""' },
  { name: 'Infinity', value: Number.POSITIVE_INFINITY, cell: '""' },
  { name: '-Infinity', value: Number.NEGATIVE_INFINITY, cell: '""' },
]

function fixture(score: number | null | undefined, path = '/probe'): UnlighthouseRouteReport {
  return {
    route: { path },
    report: {
      score,
      categories: [{ key: 'performance', title: 'Performance', score }],
      audits: {},
    },
  } as UnlighthouseRouteReport
}

function generateCsv(reporter: 'csv' | 'csvExpanded', reports: UnlighthouseRouteReport[]): string {
  if (reporter === 'csvExpanded')
    return generateReportPayload(reporter, reports, {})
  return generateReportPayload(reporter, reports)
}

for (const reporter of ['csv', 'csvExpanded'] as const) {
  describe(`${reporter}: distinguish unavailable scores from zero`, () => {
    for (const { name, value, cell } of scores) {
      it(`category ${name}`, () => {
        const report = fixture(value)
        report.report.score = 0.5
        expect(generateCsv(reporter, [report])).toBe(`URL,Score,Performance\n"/probe",50,${cell}`)
      })

      it(`overall ${name}`, () => {
        const report = fixture(value)
        report.report.categories[0]!.score = 0.5
        expect(generateCsv(reporter, [report])).toBe(`URL,Score,Performance\n"/probe",${cell},50`)
      })
    }

    it('keeps unavailable and absent category cells aligned with later values', () => {
      const first = fixture(null, '/a')
      first.report.score = 0
      first.report.categories.push({ key: 'accessibility', id: 'accessibility', title: 'Accessibility', score: 0.75 })
      const second = fixture(0, '/b')
      second.report.score = 0.5
      second.report.categories = [{ key: 'accessibility', id: 'accessibility', title: 'Accessibility', score: null }]
      const third = fixture(0, '/c')
      third.report.score = 1
      third.report.categories.push({ key: 'accessibility', id: 'accessibility', title: 'Accessibility', score: 1 })
      expect(generateCsv(reporter, [first, second, third])).toBe([
        'URL,Score,Performance,Accessibility',
        '"/a",0,"",75',
        '"/b",50,"",""',
        '"/c",100,0,100',
      ].join('\n'))
    })

    it('supports empty reports without inventing score values', () => {
      expect(generateCsv(reporter, [])).toBe('URL,Score')
    })

    it('preserves input scores including null', () => {
      const report = fixture(null)
      const before = structuredClone(report)
      generateCsv(reporter, [report])
      expect(report).toEqual(before)
    })

    it('writes an unavailable category as an empty cell in ci-result.csv', async () => {
      const outputPath = await mkdtemp(join(tmpdir(), 'unlighthouse-csv-score-'))
      try {
        const report = fixture(null)
        report.report.score = 0
        const payload = generateCsv(reporter, [report])
        const file = await outputReport(reporter, { outputPath }, payload)
        expect(file).toBe(join(outputPath, 'ci-result.csv'))
        expect(await readFile(file, 'utf8')).toBe('URL,Score,Performance\n"/probe",0,""')
      }
      finally {
        await rm(outputPath, { recursive: true, force: true })
      }
    })
  })
}

it('keeps the csvSimple alias consistent', () => {
  const report = fixture(null)
  expect(generateReportPayload('csvSimple', [report])).toBe(generateReportPayload('csv', [report]))
})

it('preserves raw null and zero scores in JSON', () => {
  const unavailable = fixture(null, '/a')
  const zero = fixture(0, '/b')
  expect(generateReportPayload('jsonSimple', [unavailable, zero])).toEqual([
    { path: '/a', score: null, performance: null },
    { path: '/b', score: 0, performance: 0 },
  ])
})
