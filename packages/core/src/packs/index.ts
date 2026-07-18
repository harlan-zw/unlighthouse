// Built-in pack registry. Third-party packs ship as `@unlighthouse-pack/<name>`
// and are merged in at host wiring time (see core.run / preset config).

import type { Pack } from '@unlighthouse/contracts/packs'
import { a11yQuickWinsPack } from './a11y-quick-wins'
import { agenticBrowsingPack } from './agentic-browsing'
import { bestPracticesPack } from './best-practices'
import { cruxPack } from './crux'
import { cwvPack } from './cwv'
import { imagesPack } from './images'
import { insightsPack } from './insights'
import { jsBundlePack } from './js-bundle'
import { overviewPack } from './overview'
import { seoBasicsPack } from './seo-basics'

export { a11yQuickWinsPack } from './a11y-quick-wins'
export { agenticBrowsingPack } from './agentic-browsing'
export { bestPracticesPack } from './best-practices'
export { analyzeLabVsField, createCruxPack, cruxPack, queryCrux } from './crux'
export { cwvPack } from './cwv'
export { imagesPack } from './images'
export { insightsPack } from './insights'
export { jsBundlePack } from './js-bundle'
export { overviewPack } from './overview'
export type { ResolvedPackRoute } from './reconcile-context'
export { resolveDistinctPackRoutes, resolveDistinctPackRows } from './reconcile-context'
export { seoBasicsPack } from './seo-basics'
// Report types are now canonical in @unlighthouse/contracts/packs.
export type {
  A11yFinding,
  A11yReport,
  AgenticBrowsingReport,
  BestPracticesFinding,
  BestPracticesReport,
  BundleFinding,
  BundleReport,
  CruxFinding,
  CruxFormFactor,
  CruxReport,
  CruxSource,
  CwvFix,
  CwvReport,
  GapAnalysis,
  GapEntry,
  ImageFinding,
  ImagesReport,
  InsightsReport,
  MetricSnapshot,
  OverviewReport,
  SeoFinding,
  SeoReport,
  SeoRouteCheck,
} from '@unlighthouse/contracts/packs'

export const builtInPacks: Record<string, Pack<unknown>> = {
  [overviewPack.name]: overviewPack,
  [cwvPack.name]: cwvPack,
  [cruxPack.name]: cruxPack,
  [imagesPack.name]: imagesPack,
  [a11yQuickWinsPack.name]: a11yQuickWinsPack,
  [jsBundlePack.name]: jsBundlePack,
  [seoBasicsPack.name]: seoBasicsPack,
  [bestPracticesPack.name]: bestPracticesPack,
  [insightsPack.name]: insightsPack,
  [agenticBrowsingPack.name]: agenticBrowsingPack,
}

export function getPack(name: string): Pack<unknown> | undefined {
  return builtInPacks[name]
}

/**
 * A resolved pack registry: the built-ins plus any host-supplied third-party
 * packs, addressable by name. Built once per host (or per `createUnlighthouseCore`
 * call) and threaded to both the scan-finalize step and the `pack.*` handlers so
 * they see the same set.
 */
export interface PackRegistry {
  get: (name: string) => Pack<unknown> | undefined
  list: () => Pack<unknown>[]
  all: () => Record<string, Pack<unknown>>
}

/**
 * Merge user packs over the built-in registry (by name — a user pack reusing a
 * built-in name replaces it). Passing no packs yields a registry over the
 * built-ins alone, so callers can always rely on a registry being present.
 */
export function createPackRegistry(userPacks?: Pack<unknown>[]): PackRegistry {
  const merged: Record<string, Pack<unknown>> = { ...builtInPacks }
  for (const pack of userPacks ?? [])
    merged[pack.name] = pack
  return {
    get: name => merged[name],
    list: () => Object.values(merged),
    all: () => merged,
  }
}
