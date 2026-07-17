// Reusable Cloudflare Workers adapters — intentionally narrow public surface.
//
// Concrete Worker request orchestration belongs to apps/cloudflare. This
// package root exposes only the primary storage adapter. Auditors, runtime
// classes, seeds, events, and Workflows live on explicit subpaths so consumers
// do not acquire unrelated platform code by importing one adapter.
export { d1R2Storage } from './storage/d1-r2'
export type { D1R2StorageOptions, D1RetryOptions } from './storage/d1-r2'
