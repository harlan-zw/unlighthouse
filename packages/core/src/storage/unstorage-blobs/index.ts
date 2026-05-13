import type { BlobPutOptions, BlobStore } from '@unlighthouse/contracts'
import type { Driver, Storage as UnstorageInstance } from 'unstorage'
import { Buffer } from 'node:buffer'
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

  return {
    async put(key: string, data: Uint8Array, _opts?: BlobPutOptions): Promise<void> {
      // unstorage accepts Buffer/Uint8Array via setItemRaw on binary-capable drivers.
      await store.setItemRaw(key, data)
    },
    async get(key: string): Promise<Uint8Array | null> {
      const raw = await store.getItemRaw(key)
      if (raw == null)
        return null
      if (raw instanceof Uint8Array)
        return raw
      if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw))
        return new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength)
      if (typeof raw === 'string')
        return new TextEncoder().encode(raw)
      // Last resort: serialise.
      return new TextEncoder().encode(JSON.stringify(raw))
    },
    async has(key: string): Promise<boolean> {
      return store.hasItem(key)
    },
    async delete(key: string): Promise<void> {
      await store.removeItem(key)
    },
  }
}
