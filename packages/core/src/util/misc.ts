import type { NormalisedRoute, UnlighthouseContext, UnlighthouseRouteReport } from '@unlighthouse/contracts'
import { Buffer } from 'node:buffer'
import { join } from 'node:path'
import { ensureDirSync } from 'fs-extra'
import { joinURL } from 'ufo'
import { hashPathName, sanitiseUrlForFilePath } from './path'

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

export function createTaskReportFromRoute(ctx: UnlighthouseContext, route: NormalisedRoute): UnlighthouseRouteReport {
  const { runtimeSettings, resolvedConfig } = ctx

  const reportId = hashPathName(route.path)
  const scanId = runtimeSettings.currentScanId
  const reportPath = join(createReportsArtifactBasePath(runtimeSettings.generatedClientPath, scanId), sanitiseUrlForFilePath(route.path))

  ensureDirSync(reportPath)

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
  return Buffer.from(dataURI.split(',')[1], 'base64')
}

export function formatBytes(bytes: number, decimals = 2) {
  if (bytes === 0)
    return '0 Bytes'

  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB']

  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return `${Number.parseFloat((bytes / k ** i).toFixed(dm))} ${sizes[i]}`
}
