import { join } from 'node:path'
import { hashPathName, sanitiseUrlForFilePath, trimSlashes } from '@unlighthouse/core/util/path'
import { joinURL, withLeadingSlash, withTrailingSlash } from 'ufo'

export { hashPathName, sanitiseUrlForFilePath, trimSlashes }
export { createAxiosInstance, fetchUrlRaw, ReportArtifacts } from '@unlighthouse/core/util/fetch'
export { computeConfigCacheKey } from './util/config-key'

/** Ensures slashes on both sides of a string. */
export const withSlashes = (s: string) => withLeadingSlash(withTrailingSlash(s)) || '/'

export function createReportsArtifactBasePath(generatedClientPath: string, scanId?: string | null) {
  return scanId
    ? join(generatedClientPath, 'reports', scanId)
    : join(generatedClientPath, 'reports')
}

export function createReportsArtifactBaseUrl(routerPrefix: string, scanId?: string | null) {
  return scanId
    ? joinURL(routerPrefix, 'reports', scanId)
    : joinURL(routerPrefix, 'reports')
}

export function hasScanScopedArtifacts(reportPath: string | null | undefined, scanId: string) {
  if (!reportPath)
    return false

  const normalised = reportPath.replaceAll('\\', '/')
  return normalised.endsWith(`/reports/${scanId}`)
}

/** Ensures a provided host is consistent, ensuring a protocol is provided. */
export function normaliseHost(host: string) {
  if (!host.startsWith('http'))
    host = `http${host.startsWith('localhost') ? '' : 's'}://${host}`
  host = host.includes('.') ? host : withTrailingSlash(host)
  return new URL(host)
}
