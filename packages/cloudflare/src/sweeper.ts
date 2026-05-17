// R2 TTL sweeper Worker.
//
// R2 has no built-in object expiry, but our `r2BlobStore.put` stamps
// `expiresAt` (ms since epoch) into customMetadata when the caller
// passes `opts.ttl`. This Worker is a cron-triggered sweeper that lists
// the bucket in pages, reads each object's head metadata, and deletes
// anything whose expiresAt has passed.
//
// Deploy alongside the main Worker:
//
//   [triggers]
//   crons = ["0 * * * *"]   # hourly
//
//   [[r2_buckets]]
//   binding = "BLOBS"
//
// then point `unlighthouse.toml`'s sweeper worker at this file.
//
// Idempotent: every run is independent. Crashes mid-page just mean the
// next cron picks up the remainder. Listed pages are bounded so a
// massive bucket sweeps in chunks instead of one giant request.

import type { R2Bucket, R2Object } from '@cloudflare/workers-types'

export interface SweeperEnv {
  BLOBS: R2Bucket
  /** Override sweep page size for tests; default 1000 (R2's max per call). */
  SWEEPER_PAGE_SIZE?: string
}

const DEFAULT_PAGE_SIZE = 1000

interface SweeperResult {
  scanned: number
  deleted: number
}

export async function sweepExpiredBlobs(env: SweeperEnv, now: number = Date.now()): Promise<SweeperResult> {
  const pageSize = Number(env.SWEEPER_PAGE_SIZE ?? DEFAULT_PAGE_SIZE)
  let cursor: string | undefined
  let scanned = 0
  const toDelete: string[] = []

  // Phase 1: walk every page and collect keys to delete. Doing the list
  // walk first (instead of deleting per-page) keeps cursor-based
  // pagination correct — listing while concurrent deletes shrink the
  // bucket would skip pages.
  do {
    const listing = await env.BLOBS.list({
      cursor,
      limit: pageSize,
      include: ['customMetadata'],
    })
    scanned += listing.objects.length

    for (const obj of listing.objects) {
      if (isExpired(obj, now))
        toDelete.push(obj.key)
    }

    cursor = listing.truncated ? listing.cursor : undefined
  } while (cursor)

  // Phase 2: delete in batches of 100 so a single failure doesn't take
  // down the whole sweep, and per-batch latency stays reasonable.
  let deleted = 0
  while (toDelete.length > 0) {
    const batch = toDelete.splice(0, 100)
    await env.BLOBS.delete(batch)
    deleted += batch.length
  }

  return { scanned, deleted }
}

function isExpired(obj: R2Object, now: number): boolean {
  const raw = obj.customMetadata?.expiresAt
  if (!raw)
    return false
  const ms = Number(raw)
  return Number.isFinite(ms) && ms > 0 && ms <= now
}

// Workers entry: cron triggers route through scheduled().
export default {
  async scheduled(_event: unknown, env: SweeperEnv): Promise<void> {
    const result = await sweepExpiredBlobs(env)
    // eslint-disable-next-line no-console
    console.log(`[r2-sweeper] scanned=${result.scanned} deleted=${result.deleted}`)
  },
}
