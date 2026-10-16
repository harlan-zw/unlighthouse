import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ISSUE_COLUMNS, issuesCsv, PAGE_COLUMNS, pagesCsv } from '../src/analysis/csv.ts'
import type { CliDeps } from '../src/cli.ts'
import { main } from '../src/cli.ts'
import type { Issue, Page } from '../src/types.ts'
import { createFakePool } from './fixtures/fake-pool.ts'
import { servePages } from './fixtures/pages.ts'

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const char = text[i]!
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"'
        i++
      }
      else if (char === '"') {
        quoted = false
      }
      else {
        cell += char
      }
    }
    else if (char === '"') {
      quoted = true
    }
    else if (char === ',') {
      row.push(cell)
      cell = ''
    }
    else if (char === '\r' && text[i + 1] === '\n') {
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
      i++
    }
    else {
      cell += char
    }
  }
  return rows
}

function page(overrides: Partial<Page>): Page {
  return {
    scanId: 's',
    url: 'https://example.com/',
    path: '/',
    template: '/',
    device: 'mobile',
    status: 'done',
    scores: { 'performance': 0.91, 'accessibility': 1, 'best-practices': 0.5, 'seo': null, 'agentic-browsing': 0.25 },
    metrics: { fcp: 900, lcp: 2400, tbt: 0, cls: 0.012, si: 1500, ttfb: null },
    finalUrl: null,
    statusCode: 200,
    provenance: null,
    error: null,
    durationMs: null,
    finishedAt: null,
    ...overrides,
  }
}

const issue: Issue = {
  auditId: 'image-delivery-insight',
  category: 'performance',
  title: 'Improve image delivery, "hero"',
  severity: 'fail',
  pages: 12,
  items: 2,
  topItems: [{ key: '=HYPERLINK("http://evil")', label: 'a,b.png', pages: 12, savingsMs: 300, savingsBytes: 100_000 }],
  devices: ['desktop', 'mobile'],
  templates: ['/', '/blog/*'],
  savingsMs: 300,
  savingsBytes: 100_000,
  impact: 13.256,
  examples: [],
}

describe('csv', () => {
  test('writes one row per page and device with every score and metric, empty cells for null', () => {
    const csv = pagesCsv([page({}), page({ device: 'desktop', status: 'failed', scores: { 'performance': null, 'accessibility': null, 'best-practices': null, 'seo': null, 'agentic-browsing': null }, metrics: { fcp: null, lcp: null, tbt: null, cls: null, si: null, ttfb: null }, error: 'Timed out\nafter 90 s' })])
    expect(csv.endsWith('\r\n')).toBe(true)
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual(PAGE_COLUMNS)
    expect(PAGE_COLUMNS).toEqual(['url', 'template', 'device', 'status', 'score_performance', 'score_accessibility', 'score_best_practices', 'score_seo', 'score_agentic_browsing', 'metric_fcp', 'metric_lcp', 'metric_tbt', 'metric_cls', 'metric_si', 'metric_ttfb', 'error'])
    expect(rows[1]).toEqual(['https://example.com/', '/', 'mobile', 'done', '0.91', '1', '0.5', '', '0.25', '900', '2400', '0', '0.012', '1500', '', ''])
    expect(rows[2]).toEqual(['https://example.com/', '/', 'desktop', 'failed', '', '', '', '', '', '', '', '', '', '', '', 'Timed out\nafter 90 s'])
    expect(rows).toHaveLength(3)
  })

  test('quotes per RFC 4180 and neutralises formula cells without touching numbers', () => {
    const csv = issuesCsv([issue])
    const rows = parseCsv(csv)
    expect(rows[0]).toEqual(ISSUE_COLUMNS)
    expect(rows[1]).toEqual(['image-delivery-insight', 'Improve image delivery, "hero"', 'performance', 'fail', '12', '2', '\'=HYPERLINK("http://evil")', 'desktop mobile', '/ /blog/*', '300', '100000', '13.26'])
    expect(csv).toContain('"\'=HYPERLINK(""http://evil"")"')
    for (const start of ['+1', '-1', '@SUM(A1)', '\tx'])
      expect(parseCsv(pagesCsv([page({ error: start })]))[1]!.at(-1)).toBe(`'${start}`)
  })

  test('adds a UTF-8 byte order mark only when asked', () => {
    expect(pagesCsv([], { bom: true }).startsWith('﻿url,')).toBe(true)
    expect(pagesCsv([]).startsWith('url,')).toBe(true)
  })
})

describe('unlighthouse export --format csv', () => {
  const site = servePages(['/', '/about'])
  const dir = mkdtempSync(join(tmpdir(), 'unlighthouse-csv-'))
  afterAll(() => {
    site.stop()
    rmSync(dir, { recursive: true, force: true })
  })

  async function run(argv: string[]) {
    let stdout = ''
    let stderr = ''
    const deps: CliDeps = {
      createPool: createFakePool().createPool,
      cwd: dir,
      env: {},
      handleSignals: false,
      stdout: { write: (text: string) => (stdout += text) },
      stderr: { write: (text: string) => (stderr += text) },
    }
    return { code: await main(argv, deps), stdout, stderr }
  }

  test('writes pages.csv and issues.csv into the output folder', async () => {
    const scan = await run(['scan', site.origin, '--device', 'mobile,desktop', '--json'])
    expect(scan.code).toBe(0)
    const scanId = JSON.parse(scan.stdout).scan.id as string
    const result = await run(['export', scanId, '--format', 'csv', '--out', 'csv', '--bom'])
    expect(result.code).toBe(0)
    const pages = readFileSync(join(dir, 'csv', 'pages.csv'), 'utf8')
    expect(pages.startsWith('﻿')).toBe(true)
    const rows = parseCsv(pages.slice(1))
    expect(rows).toHaveLength(5)
    expect(rows.slice(1).map(row => `${row[2]} ${row[0]}`).sort()).toEqual([
      `desktop ${site.origin}/`,
      `desktop ${site.origin}/about`,
      `mobile ${site.origin}/`,
      `mobile ${site.origin}/about`,
    ])
    const issues = parseCsv(readFileSync(join(dir, 'csv', 'issues.csv'), 'utf8').slice(1))
    expect([issues[1]![0], issues[1]![ISSUE_COLUMNS.indexOf('top_item')]]).toEqual(['image-delivery-insight', '/hero.png'])
    expect(issues[1]![ISSUE_COLUMNS.indexOf('pages')]).toBe('2')
    expect((await run(['export', scanId, '--format', 'pdf'])).code).toBe(2)
  })
})
