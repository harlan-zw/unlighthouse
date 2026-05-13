import type { LighthouseScanOptions, LighthouseScanResult } from '../services/lighthouse'

export interface Auditor {
  audit: (options: LighthouseScanOptions) => Promise<LighthouseScanResult>
}

export const DEFAULT_CATEGORIES = ['performance', 'accessibility', 'best-practices', 'seo']

export const KEY_AUDITS = [
  'first-contentful-paint',
  'largest-contentful-paint',
  'total-blocking-time',
  'cumulative-layout-shift',
  'speed-index',
  'interactive',
  'server-response-time',
]

export function resolveCategories(options: LighthouseScanOptions): string[] {
  return options.categories?.length ? options.categories : DEFAULT_CATEGORIES
}

export function resolveThrottling(throttling: LighthouseScanOptions['throttling']) {
  // mobile4G is Lighthouse's default; passing `undefined` keeps it.
  if (throttling === 'none') {
    return { rttMs: 0, throughputKbps: 0, requestLatencyMs: 0, downloadThroughputKbps: 0, uploadThroughputKbps: 0, cpuSlowdownMultiplier: 1 }
  }
  if (throttling === 'mobile3G') {
    return { rttMs: 300, throughputKbps: 700, requestLatencyMs: 1125, downloadThroughputKbps: 700, uploadThroughputKbps: 700, cpuSlowdownMultiplier: 4 }
  }
  return undefined
}

export function resolveScreenEmulation(formFactor: 'mobile' | 'desktop') {
  return {
    mobile: formFactor === 'mobile',
    width: formFactor === 'mobile' ? 375 : 1350,
    height: formFactor === 'mobile' ? 667 : 940,
    deviceScaleFactor: formFactor === 'mobile' ? 2 : 1,
    disabled: false,
  }
}
