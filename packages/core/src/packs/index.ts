// Built-in pack registry. Third-party packs ship as `@unlighthouse-pack/<name>`
// and are merged in at host wiring time (see core.run / preset config).

import type { Pack } from '@unlighthouse/contracts/packs'
import { a11yQuickWinsPack } from './a11y-quick-wins'
import { agenticBrowsingPack } from './agentic-browsing'
import { cruxPack } from './crux'
import { cwvPack } from './cwv'
import { imagesPack } from './images'
import { insightsPack } from './insights'
import { jsBundlePack } from './js-bundle'
import { overviewPack } from './overview'
import { seoBasicsPack } from './seo-basics'

export { a11yQuickWinsPack } from './a11y-quick-wins'
export { agenticBrowsingPack } from './agentic-browsing'
export { analyzeLabVsField, createCruxPack, cruxPack, queryCrux } from './crux'
export { cwvPack } from './cwv'
export { imagesPack } from './images'
export { insightsPack } from './insights'
export { jsBundlePack } from './js-bundle'
export { overviewPack } from './overview'
export { seoBasicsPack } from './seo-basics'
// Report types are now canonical in @unlighthouse/contracts/packs.
export type {
  A11yFinding,
  A11yReport,
  AgenticBrowsingReport,
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
  [overviewPack.name]: overviewPack as Pack<unknown>,
  [cwvPack.name]: cwvPack as Pack<unknown>,
  [cruxPack.name]: cruxPack as Pack<unknown>,
  [imagesPack.name]: imagesPack as Pack<unknown>,
  [a11yQuickWinsPack.name]: a11yQuickWinsPack as Pack<unknown>,
  [jsBundlePack.name]: jsBundlePack as Pack<unknown>,
  [seoBasicsPack.name]: seoBasicsPack as Pack<unknown>,
  [insightsPack.name]: insightsPack as Pack<unknown>,
  [agenticBrowsingPack.name]: agenticBrowsingPack as Pack<unknown>,
}

export function getPack(name: string): Pack<unknown> | undefined {
  return builtInPacks[name]
}
