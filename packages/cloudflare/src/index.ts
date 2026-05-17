// Cloudflare Workers preset — public surface.
//
// `createCloudflareBrowserAuditor` lives on a separate subpath
// (`@unlighthouse/cloudflare/auditors/browser-rendering`) so its
// transitive lighthouse dependency only enters the Worker bundle
// when the operator actually opts in. The default `createCloudflareApp`
// path uses the mock auditor unless the caller wires a factory via
// `opts.auditorFactory`.

export type { CloudflareApp, CloudflareEnv, CreateCloudflareAppOptions } from './app'
export { createCloudflareApp } from './app'
export { cloudflareCrawler } from './crawlers/cloudflare-crawl'
export type { CloudflareCrawlerOptions } from './crawlers/cloudflare-crawl'
export { RateLimiterDO } from './do/rate-limiter'
export type { RateLimiterCheckResult, RateLimiterConfig, RateLimiterEnv } from './do/rate-limiter'
export { ScanEventsDO } from './do/scan-events'
export { d1R2Storage } from './storage/d1-r2'
export type { D1R2StorageOptions } from './storage/d1-r2'
export { default as sweeperWorker, sweepExpiredBlobs } from './sweeper'
export type { SweeperEnv } from './sweeper'
