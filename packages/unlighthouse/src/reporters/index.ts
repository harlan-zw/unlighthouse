import type { ResolvedUserConfig, UnlighthouseRouteReport } from '../index.ts'
import type { ReporterConfig, ReportJsonExpanded, ReportJsonSimple } from './types'
import { join } from 'node:path'
import fse from 'fs-extra'
import { reportCSVExpanded } from './csvExpanded'
import { reportCSVSimple } from './csvSimple'
import { reportJsonExpanded } from './jsonExpanded'
import { reportJsonSimple } from './jsonSimple'

type ReportWithLighthouse = UnlighthouseRouteReport & {
  report: NonNullable<UnlighthouseRouteReport['report']>
}

function hasLighthouseReport(report: UnlighthouseRouteReport): report is ReportWithLighthouse {
  return !!report.report?.categories && !!report.report.audits
}

export function generateReportPayload(reporter: 'lighthouseServer', reports: UnlighthouseRouteReport[], config?: ReporterConfig): Promise<void>
export function generateReportPayload(reporter: 'jsonExpanded', reports: UnlighthouseRouteReport[]): ReportJsonExpanded
export function generateReportPayload(reporter: 'jsonSimple' | 'json', reports: UnlighthouseRouteReport[]): ReportJsonSimple
export function generateReportPayload(reporter: 'csvSimple' | 'csv', reports: UnlighthouseRouteReport[]): string
export function generateReportPayload(reporter: 'csvExpanded', reports: UnlighthouseRouteReport[], config?: ReporterConfig): string
export function generateReportPayload(reporter: string, _reports: UnlighthouseRouteReport[], config?: ReporterConfig): any {
  const reports = _reports
    .sort((a, b) => a.route.path.localeCompare(b.route.path))
    .filter(hasLighthouseReport)

  if (reporter.startsWith('json')) {
    if (reporter === 'jsonSimple' || reporter === 'json')
      return reportJsonSimple(reports)
    if (reporter === 'jsonExpanded')
      return reportJsonExpanded(reports)
  }
  if (reporter.startsWith('csv')) {
    if (reporter === 'csvSimple' || reporter === 'csv')
      return reportCSVSimple(reports)
    if (reporter === 'csvExpanded')
      return reportCSVExpanded(reports, config ?? {})
  }
  if (reporter === 'lighthouseServer') {
    // Lazy: @lhci/utils is an optional peer; only load when this reporter is chosen.
    return import('./lighthouseServer').then(m => m.reportLighthouseServer(reports, config ?? {}))
  }

  throw new Error(`Unsupported reporter: ${reporter}.`)
}

export async function outputReport(reporter: string, config: Partial<ResolvedUserConfig>, payload: any) {
  if (!config.outputPath)
    throw new Error('Cannot output report without an outputPath.')

  if (reporter.startsWith('json')) {
    const path = join(config.outputPath, 'ci-result.json')
    await fse.writeJson(path, payload, { spaces: 2 })
    return path
  }
  if (reporter.startsWith('csv')) {
    const path = join(config.outputPath, 'ci-result.csv')
    await fse.writeFile(path, payload)
    return path
  }
  throw new Error(`Unsupported reporter: ${reporter}.`)
}
