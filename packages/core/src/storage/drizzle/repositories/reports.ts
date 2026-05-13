import type {
  AccessibilityElementRow,
  AccessibilityIssueRow,
  CanonicalChainRow,
  ConsoleErrorRow,
  DashboardSummaryRow,
  DeprecatedApiRow,
  DetectedLibraryRow,
  LcpElementRow,
  LinkTextIssueRow,
  MissingAltImageRow,
  PerformanceIssueRow,
  ScanCruxRow,
  SecurityIssueRow,
  SeoDuplicateRow,
  SeoMetaRow,
  TapTargetIssueRow,
  ThirdPartyScriptRow,
  VulnerableLibraryRow,
} from '@unlighthouse/contracts/drizzle'
import {
  accessibilityElements,
  accessibilityIssues,
  canonicalChains,
  consoleErrors,
  dashboardSummaries,
  deprecatedApis,
  detectedLibraries,
  lcpElements,
  linkTextIssues,
  missingAltImages,
  performanceIssues,
  scanCrux,
  securityIssues,
  seoDuplicates,
  seoMeta,
  tapTargetIssues,
  thirdPartyScripts,
  vulnerableLibraries,
} from '@unlighthouse/contracts/drizzle'
import { desc, eq } from 'drizzle-orm'

type AnyDrizzle = any

function listBy<Row>(db: AnyDrizzle, table: any, scanIdCol: any, orderBy?: any) {
  return {
    async list(scanId: string): Promise<Row[]> {
      const q = db.select().from(table).where(eq(scanIdCol, scanId))
      const rows = orderBy ? await q.orderBy(orderBy) : await q
      return rows as Row[]
    },
  }
}

export function createReportRepositories(db: AnyDrizzle) {
  return {
    accessibility: listBy<AccessibilityIssueRow>(db, accessibilityIssues, accessibilityIssues.scanId, desc(accessibilityIssues.instanceCount)),
    accessibilityElements: listBy<AccessibilityElementRow>(db, accessibilityElements, accessibilityElements.scanId, desc(accessibilityElements.pageCount)),
    missingAltImages: listBy<MissingAltImageRow>(db, missingAltImages, missingAltImages.scanId, desc(missingAltImages.pageCount)),
    performance: listBy<PerformanceIssueRow>(db, performanceIssues, performanceIssues.scanId, desc(performanceIssues.wastedBytes)),
    thirdPartyScripts: listBy<ThirdPartyScriptRow>(db, thirdPartyScripts, thirdPartyScripts.scanId, desc(thirdPartyScripts.avgTbt)),
    lcpElements: listBy<LcpElementRow>(db, lcpElements, lcpElements.scanId, desc(lcpElements.pageCount)),
    seoMeta: listBy<SeoMetaRow>(db, seoMeta, seoMeta.scanId),
    seoDuplicates: listBy<SeoDuplicateRow>(db, seoDuplicates, seoDuplicates.scanId, desc(seoDuplicates.pageCount)),
    canonicalChains: listBy<CanonicalChainRow>(db, canonicalChains, canonicalChains.scanId),
    linkTextIssues: listBy<LinkTextIssueRow>(db, linkTextIssues, linkTextIssues.scanId, desc(linkTextIssues.instanceCount)),
    tapTargetIssues: listBy<TapTargetIssueRow>(db, tapTargetIssues, tapTargetIssues.scanId),
    bestPracticesSecurity: listBy<SecurityIssueRow>(db, securityIssues, securityIssues.scanId),
    bestPracticesLibraries: listBy<DetectedLibraryRow>(db, detectedLibraries, detectedLibraries.scanId, desc(detectedLibraries.pageCount)),
    bestPracticesVulnerable: listBy<VulnerableLibraryRow>(db, vulnerableLibraries, vulnerableLibraries.scanId),
    bestPracticesDeprecated: listBy<DeprecatedApiRow>(db, deprecatedApis, deprecatedApis.scanId, desc(deprecatedApis.pageCount)),
    bestPracticesConsoleErrors: listBy<ConsoleErrorRow>(db, consoleErrors, consoleErrors.scanId, desc(consoleErrors.instanceCount)),
    crux: listBy<ScanCruxRow>(db, scanCrux, scanCrux.scanId),
    dashboardSummary: {
      async get(scanId: string): Promise<DashboardSummaryRow | null> {
        const [row] = await db.select().from(dashboardSummaries).where(eq(dashboardSummaries.scanId, scanId)).limit(1)
        return (row as DashboardSummaryRow) ?? null
      },
    },
  }
}
