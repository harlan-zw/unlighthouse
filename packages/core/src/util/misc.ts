import type { NormalisedRoute, ResolvedUserConfig, UnlighthouseRouteReport } from '@unlighthouse/contracts'
import { Buffer } from 'node:buffer'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { joinURL } from 'ufo'
import { hashPathName, sanitiseUrlForFilePath } from './path'

export interface CreateTaskReportDeps {
  resolvedConfig: ResolvedUserConfig
  generatedClientPath: string
  currentScanId: string | null
}

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

export function createTaskReportFromRoute(deps: CreateTaskReportDeps, route: NormalisedRoute): UnlighthouseRouteReport {
  const { resolvedConfig, generatedClientPath, currentScanId } = deps

  const reportId = hashPathName(route.path)
  const scanId = currentScanId
  const reportPath = join(createReportsArtifactBasePath(generatedClientPath, scanId), sanitiseUrlForFilePath(route.path))

  mkdirSync(reportPath, { recursive: true })

  return {
    tasks: {
      runLighthouseTask: 'waiting',
      inspectHtmlTask: 'waiting',
    },
    route,
    reportId,
    artifactPath: reportPath,
    artifactUrl: joinURL(createReportsArtifactBaseUrl(resolvedConfig.routerPrefix, scanId), sanitiseUrlForFilePath(route.path)),
  }
}

export function base64ToBuffer(dataURI: string) {
  const commaIndex = dataURI.indexOf(',')
  const base64 = commaIndex === -1 ? dataURI : dataURI.slice(commaIndex + 1)
  return Buffer.from(base64, 'base64')
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0)
    return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1)
  const unit = sizes[i] ?? 'Bytes'

  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${unit}`
}
