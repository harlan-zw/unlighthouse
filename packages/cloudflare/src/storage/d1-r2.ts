// Storage port composed from shared Drizzle repositories (D1 rows) + R2 blobs.

import type {
  BlobPutOptions,
  BlobStore,
  Storage,
} from '@unlighthouse/contracts/ports'
import type { DrizzleBatchExecutor } from '@unlighthouse/core/storage/drizzle'
import { drizzleStorage, INIT_SQL_STATEMENTS } from '@unlighthouse/core/storage/drizzle'
import { drizzle } from 'drizzle-orm/d1'

export type { BlobStore }

export interface D1R2StorageOptions {
  db: D1Database
  bucket: R2Bucket
}

export interface D1RetryOptions {
  /** Total calls, including the first attempt. */
  maxAttempts?: number
  /** Injectable for deterministic tests. */
  sleep?: (milliseconds: number) => Promise<void>
  /** Injectable jitter source in the inclusive range 0..1. */
  random?: () => number
}

const D1_TRANSIENT_ERRORS = [
  'Network connection lost',
  'storage caused object to be reset',
  'reset because its code was updated',
  'Cannot resolve D1 DB due to transient issue on remote node',
] as const

function isTransientD1Error(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return D1_TRANSIENT_ERRORS.some(fragment => message.includes(fragment))
}

/** Retry only repeat-safe D1 writes and only for Cloudflare's documented transient errors. */
export async function retryD1IdempotentWrite<T>(
  operation: () => Promise<T>,
  options: D1RetryOptions = {},
): Promise<T> {
  const maxAttempts = Math.max(1, Math.trunc(options.maxAttempts ?? 5))
  const sleep = options.sleep ?? (milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds)))
  const random = options.random ?? Math.random

  for (let attempt = 1; ; attempt++) {
    try {
      return await operation()
    }
    catch (error) {
      if (attempt >= maxAttempts || !isTransientD1Error(error))
        throw error

      // 50–150% jitter prevents concurrent Worker isolates retrying in lockstep.
      const delay = Math.round(100 * 2 ** (attempt - 1) * (0.5 + random()))
      await sleep(delay)
    }
  }
}

function r2BlobStore(bucket: R2Bucket): BlobStore {
  return {
    async put(key: string, data: Uint8Array, opts?: BlobPutOptions) {
      const customMetadata: Record<string, string> | undefined = opts?.ttl
        ? { expiresAt: String(Date.now() + opts.ttl * 1000) }
        : undefined
      await bucket.put(key, data, {
        httpMetadata: opts?.contentType ? { contentType: opts.contentType } : undefined,
        customMetadata,
      })
    },
    async get(key: string) {
      const object = await bucket.get(key)
      if (!object)
        return null
      return new Uint8Array(await object.arrayBuffer())
    },
    async getStream(key: string) {
      const object = await bucket.get(key)
      return object?.body ?? null
    },
    async has(key: string) {
      return await bucket.head(key) != null
    },
    async delete(key: string) {
      await bucket.delete(key)
    },
    async list(prefix: string): Promise<string[]> {
      const keys: string[] = []
      let cursor: string | undefined
      do {
        const listing = await bucket.list({ prefix, cursor })
        for (const object of listing.objects)
          keys.push(object.key)
        cursor = listing.truncated ? listing.cursor : undefined
      } while (cursor)
      return keys
    },
  }
}

function isIdempotentMigrationError(error: unknown): boolean {
  return error instanceof Error && /duplicate column name|already exists/i.test(error.message)
}

/**
 * One-shot schema bootstrap for tests and local development.
 * Production applies the checked-in core SQLite migrations with Wrangler.
 */
export async function migrate(db: D1Database): Promise<void> {
  for (const statement of INIT_SQL_STATEMENTS) {
    try {
      await db.prepare(statement).run()
    }
    catch (error) {
      if (!isIdempotentMigrationError(error))
        throw error
    }
  }
}

export function d1R2Storage(opts: D1R2StorageOptions): Storage {
  const db = drizzle(opts.db as unknown as Parameters<typeof drizzle>[0])
  const executeBatch: DrizzleBatchExecutor = async (statements) => {
    await db.batch(statements as unknown as Parameters<typeof db.batch>[0])
  }
  const rows = drizzleStorage({
    driver: db,
    executeBatch,
    retryIdempotentWrite: retryD1IdempotentWrite,
  })

  return {
    ...rows,
    blobs: r2BlobStore(opts.bucket),
    db,
  }
}
