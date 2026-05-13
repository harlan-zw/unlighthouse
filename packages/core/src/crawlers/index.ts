// v1 — Crawler port factories. Legacy puppeteer-cluster orchestrator lives inside
// ./legacy-cluster and is exposed via crawleeCrawler() (kept name for the
// public adapter; legacyClusterCrawler is the new alias).
export * from './legacy-cluster'
// New vocabulary alias — same factory, names track D-024.
export { crawleeCrawler as legacyClusterCrawler } from './legacy-cluster'
export type { CrawleeAdapterHooks as LegacyClusterAdapterHooks, CrawleeCrawler as LegacyClusterCrawler, CrawleeCrawlerOptions as LegacyClusterCrawlerOptions } from './legacy-cluster'

export { crawlSite } from './legacy-cluster/orchestrator'
export * from './parallel-map'
