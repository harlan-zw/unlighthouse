import type { BlobPutOptions, BlobStore } from '@unlighthouse/contracts'
import type { Driver, Storage as UnstorageInstance } from 'unstorage'
import { createStorage as createUnstorage } from 'unstorage'

export interface UnstorageBlobsOptions {
  /** An unstorage driver instance (fsDriver, s3Driver, r2BindingDriver, etc.). */
  driver: Driver
}

/**
 * Wrap an unstorage driver as a `BlobStore`. All bytes are stored via the
 * underlying driver's raw-item API (`getItemRaw` / `setItemRaw`), preserving
 * gzipped payloads without text-encoding round-trips.
 */
export function unstorageBlobs(opts: UnstorageBlobsOptions): BlobStore {
  const store: UnstorageInstance = createUnstorage({ driver: opts.driver })

  async function isExpired(key: string): Promise<boolean> {
    const meta = await store.getMeta(key)
    const expiresAt = typeof meta.expiresAt === 'number' ? meta.expiresAt : null
    if (expiresAt == null || expiresAt > Date.now())
      return false
    await store.removeItem(key, { removeMeta: true })
    return true
  }

  return {
    async put(key: string, data: Uint8Array, putOptions?: BlobPutOptions): Promise<void> {
      // unstorage accepts Buffer/Uint8Array via setItemRaw on binary-capable drivers.
      await store.setItemRaw(key, data)
      if (putOptions?.ttl !== undefined || putOptions?.contentType !== undefined) {
        await store.setMeta(key, {
          ...(putOptions.ttl !== undefined ? { ttl: putOptions.ttl, expiresAt: Date.now() + putOptions.ttl * 1000 } : {}),
          ...(putOptions.contentType !== undefined ? { contentType: putOptions.contentType } : {}),
        }).catch(async (error) => {
          // Do not leave an object whose requested retention/metadata contract
          // was silently dropped.
          let cleanupError: unknown
          await store.removeItem(key, { removeMeta: true }).catch((cause) => { cleanupError = cause })
          if (cleanupError !== undefined)
            throw new AggregateError([error, cleanupError], `Blob metadata write and rollback both failed for ${key}`)
          throw error
        })
      }
      else {
        // An overwrite without options clears any previous TTL/content type.
        await store.setMeta(key, {})
      }
    },
    async get(key: string): Promise<Uint8Array | null> {
      if (await isExpired(key))
        return null
      const raw = await store.getItemRaw(key)
      if (raw == null)
        return null
      // A Node Buffer is a Uint8Array subclass, so this branch also handles it.
      if (raw instanceof Uint8Array)
        return raw
      if (typeof raw === 'string')
        return new TextEncoder().encode(raw)
      // Last resort: serialise.
      return new TextEncoder().encode(JSON.stringify(raw))
    },
    async has(key: string): Promise<boolean> {
      if (await isExpired(key))
        return false
      return store.hasItem(key)
    },
    async delete(key: string): Promise<void> {
      await store.removeItem(key)
    },
    async list(prefix: string): Promise<string[]> {
      // getKeys returns keys under the base; pass the prefix so drivers that
      // support it (fs, r2) scope the walk natively.
      const keys = (await store.getKeys(prefix)).filter(key => !key.endsWith('$'))
      const live: string[] = []
      for (const key of keys) {
        if (!await isExpired(key))
          // unstorage normalises path separators to `:` internally. BlobStore
          // callers own slash-delimited namespaces and must see their keys in
          // the same form they passed to put().
          live.push(key.replaceAll(':', '/'))
      }
      return live
    },
  }
}
