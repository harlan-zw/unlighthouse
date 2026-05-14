// Built-in pack registry. Third-party packs ship as `@unlighthouse-pack/<name>`
// and are merged in at host wiring time (see core.run / preset config).

import type { Pack } from '@unlighthouse/contracts'
import { imagesPack } from './images'
import { overviewPack } from './overview'

export { imagesPack } from './images'
export type { ImageFinding, ImagesReport } from './images'
export { overviewPack } from './overview'
export type { OverviewReport } from './overview'

// Keyed map for host-side lookup. Keeping it as a Record (not a Map) so it
// trivially serialises and so `pack.list` can iterate the entries.
export const builtInPacks: Record<string, Pack<unknown>> = {
  [overviewPack.name]: overviewPack as Pack<unknown>,
  [imagesPack.name]: imagesPack as Pack<unknown>,
}

export function getPack(name: string): Pack<unknown> | undefined {
  return builtInPacks[name]
}
