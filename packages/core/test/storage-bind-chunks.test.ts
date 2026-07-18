import type { Assertion, ExtractedMetrics, ScanId } from '@unlighthouse/contracts/types/atoms'
import { assertions, comparisonDiffs, comparisons } from '@unlighthouse/contracts/drizzle'
import { compareScans, evaluateAndStoreAssertions } from '@unlighthouse/core/comparison'
import { drizzleStorage, INIT_SQL_STATEMENTS } from '@unlighthouse/core/storage/drizzle'
import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { describe, expect, it } from 'vitest'
import { testScanId, testUrl } from '../../../test/helpers/contracts'

function instrumentInsertSizes(db: ReturnType<typeof drizzle>) {
  const sizes = new Map<unknown, number[]>()
  const instrumented = new Proxy(db, {
    get(target, property, receiver) {
      if (property !== 'insert')
        return Reflect.get(target, property, receiver)
      return (table: unknown) => {
        const builder = db.insert(table as never) as ReturnType<typeof db.insert> & { values: (rows: unknown) => unknown }
        const values = builder.values.bind(builder)
        builder.values = (rows: unknown) => {
          if (Array.isArray(rows)) {
            const entries = sizes.get(table) ?? []
            entries.push(rows.length)
            sizes.set(table, entries)
          }
          return values(rows)
        }
        return builder
      }
    },
  })
  return { db: instrumented, sizes }
}

function createDatabase() {
  const sqlite = new Database(':memory:')
  for (const statement of INIT_SQL_STATEMENTS) {
    try {
      sqlite.exec(statement)
    }
    catch (error) {
      if (!/duplicate column name/i.test((error as Error).message))
        throw error
    }
  }
  return instrumentInsertSizes(drizzle(sqlite))
}

function metric(index: number, scorePerformance: number): ExtractedMetrics {
  const url = testUrl(`https://example.com/${index}`)
  return {
    url,
    path: `/${index}`,
    routeName: null,
    scorePerformance,
    scoreAccessibility: 0.9,
    scoreSeo: 0.9,
    scoreBestPractices: 0.9,
    lcp: 1_000,
    cls: 0.01,
    inp: 100,
    fcp: 800,
    ttfb: 100,
    tbt: 50,
    si: 1_200,
    lighthouseVersion: 'test',
    capturedAt: '2026-01-01T00:00:00.000Z',
  }
}

async function seedScan(rows: ReturnType<typeof drizzleStorage>, scanId: ScanId, score: number): Promise<void> {
  await rows.scans.create({
    scanId,
    site: testUrl('https://example.com'),
    mode: 'site',
    device: 'mobile',
    status: 'complete',
    startedAt: '2026-01-01T00:00:00.000Z',
    completedAt: '2026-01-01T00:05:00.000Z',
    ciBranch: null,
    ciCommit: null,
    ciCommitMessage: null,
    summary: null,
  })
  await rows.routes.putBatch(scanId, 'mobile', Array.from({ length: 45 }, (_, index) => metric(index, score)))
}

describe('d1-safe bulk persistence', () => {
  it('chunks comparison/assertion inserts below 100 binds and replaces retry materialisations', async () => {
    const { db, sizes } = createDatabase()
    const rows = drizzleStorage({ driver: db })
    const baseId = testScanId('bind-base')
    const currentId = testScanId('bind-current')
    await seedScan(rows, baseId, 0.9)
    await seedScan(rows, currentId, 0.5)

    await compareScans(db, baseId, currentId)
    await compareScans(db, baseId, currentId)
    const comparisonRows = await db.select().from(comparisons)
    const diffRows = await db.select().from(comparisonDiffs)
    expect(comparisonRows).toHaveLength(1)
    expect(diffRows).toHaveLength(45)
    expect(sizes.get(comparisonDiffs)).toEqual([16, 16, 13, 16, 16, 13])
    expect((sizes.get(comparisonDiffs) ?? []).every(size => size * 6 <= 100)).toBe(true)

    const configs: Assertion[] = Array.from({ length: 30 }, (_, index) => ({
      type: 'minScore',
      category: 'performance',
      value: index / 100,
    }))
    await evaluateAndStoreAssertions(db, currentId, configs)
    await evaluateAndStoreAssertions(db, currentId, configs)
    const assertionRows = await db.select().from(assertions)
    expect(assertionRows).toHaveLength(30)
    expect(sizes.get(assertions)).toEqual([12, 12, 6, 12, 12, 6])
    expect((sizes.get(assertions) ?? []).every(size => size * 8 <= 100)).toBe(true)
  })

  it('preserves device identity in materialised comparison diffs', async () => {
    const { db } = createDatabase()
    const rows = drizzleStorage({ driver: db })
    const baseId = testScanId('device-base')
    const currentId = testScanId('device-current')
    await seedScan(rows, baseId, 0.9)
    await seedScan(rows, currentId, 0.5)
    await rows.routes.putBatch(baseId, 'desktop', [metric(0, 0.9)])
    await rows.routes.putBatch(currentId, 'desktop', [metric(0, 0.5)])

    await compareScans(db, baseId, currentId)
    const diffRows = await db.select().from(comparisonDiffs)
    const devices = diffRows
      .filter(row => row.url === 'https://example.com/0')
      .map(row => row.device)
      .sort()
    expect(devices).toEqual(['desktop', 'mobile'])
  })
})
