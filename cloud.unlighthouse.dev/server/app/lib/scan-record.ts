import type { LighthouseScanOptions, LighthouseScanResult } from '../services/lighthouse'
import { eq } from 'drizzle-orm'
import { getDatabase, schema } from '../../database'
import { projectScores } from './scan-request'

export interface CreatePendingScanInput {
  userId: number
  options: LighthouseScanOptions
  endpoint: 'self-hosted' | 'browserless'
}

export async function createPendingScan(input: CreatePendingScanInput) {
  const db = await getDatabase()
  const [scan] = await db.insert(schema.scans).values({
    userId: input.userId,
    url: input.options.url,
    categories: JSON.stringify(input.options.categories || ['performance', 'accessibility', 'best-practices', 'seo']),
    formFactor: input.options.formFactor || 'mobile',
    throttling: input.options.throttling || 'mobile4G',
    status: 'queued',
    endpoint: input.endpoint,
  }).returning()
  return scan
}

export async function markScanCached(scanId: number, result: LighthouseScanResult) {
  const db = await getDatabase()
  await db.update(schema.scans)
    .set({
      status: 'cached',
      cached: true,
      result: JSON.stringify(result),
      ...projectScores(result),
      completedAt: new Date(),
    })
    .where(eq(schema.scans.id, scanId))
}

export async function markScanProcessing(scanId: number) {
  const db = await getDatabase()
  await db.update(schema.scans)
    .set({ status: 'processing', startedAt: new Date() })
    .where(eq(schema.scans.id, scanId))
}

export async function markScanCompleted(scanId: number, result: LighthouseScanResult) {
  const db = await getDatabase()
  await db.update(schema.scans)
    .set({
      status: 'completed',
      result: JSON.stringify(result),
      fetchTime: result.fetchTime,
      ...projectScores(result),
      completedAt: new Date(),
    })
    .where(eq(schema.scans.id, scanId))
}

export async function markScanFailed(scanId: number, error: string) {
  const db = await getDatabase()
  await db.update(schema.scans)
    .set({ status: 'failed', error, completedAt: new Date() })
    .where(eq(schema.scans.id, scanId))
}
