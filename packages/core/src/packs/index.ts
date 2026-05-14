// Built-in pack registry. Third-party packs ship as `@unlighthouse-pack/<name>`
// and are merged in at host wiring time (see core.run / preset config).

import type { Pack } from '@unlighthouse/contracts'
import { a11yQuickWinsPack } from './a11y-quick-wins'
import { cwvPack } from './cwv'
import { imagesPack } from './images'
import { jsBundlePack } from './js-bundle'
import { overviewPack } from './overview'

export { a11yQuickWinsPack } from './a11y-quick-wins'
export type { A11yFinding, A11yReport } from './a11y-quick-wins'
export { cwvPack } from './cwv'
export type { CwvFix, CwvReport, MetricSnapshot } from './cwv'
export { imagesPack } from './images'
export type { ImageFinding, ImagesReport } from './images'
export { jsBundlePack } from './js-bundle'
export type { BundleFinding, BundleReport } from './js-bundle'
export { overviewPack } from './overview'
export type { OverviewReport } from './overview'

// Keyed map for host-side lookup. Keeping it as a Record (not a Map) so it
// trivially serialises and so `pack.list` can iterate the entries.
export const builtInPacks: Record<string, Pack<unknown>> = {
  [overviewPack.name]: overviewPack as Pack<unknown>,
  [cwvPack.name]: cwvPack as Pack<unknown>,
  [imagesPack.name]: imagesPack as Pack<unknown>,
  [a11yQuickWinsPack.name]: a11yQuickWinsPack as Pack<unknown>,
  [jsBundlePack.name]: jsBundlePack as Pack<unknown>,
}

export function getPack(name: string): Pack<unknown> | undefined {
  return builtInPacks[name]
}
