// Storage port composed from shared Drizzle repositories (D1 rows) + R2 blobs.

import type {
  D1Database,
  R2Bucket,
} from '@cloudflare/workers-types'
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
  const rows = drizzleStorage({ driver: db, executeBatch })

  return {
    ...rows,
    blobs: r2BlobStore(opts.bucket),
    db,
  }
}
