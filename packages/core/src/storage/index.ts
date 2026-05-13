import type { BlobStore, ScanRepository, ScanRouteRepository, Storage } from '@unlighthouse/contracts'

export interface CreateStorageOptions {
  rows: { scans: ScanRepository, routes: ScanRouteRepository }
  blobs: BlobStore
}

/**
 * Compose row + blob halves into a `Storage`. Trivial; exists so callers
 * don't reach into individual adapter return shapes.
 */
export * from './wrap'

export function createStorage(opts: CreateStorageOptions): Storage {
  return {
    scans: opts.rows.scans,
    routes: opts.rows.routes,
    blobs: opts.blobs,
  }
}
