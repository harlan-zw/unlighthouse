// sites.* handlers — backed by a host-provided SitesStore.

import type {
  CommandOutput,
  Site,
  SitesCreate,
  SitesDelete,
  SitesGet,
  SitesList,
} from '@unlighthouse/contracts'
import type { Handler } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts'

function requireStore(ctx: { sites?: SitesStore }): SitesStore {
  if (!ctx.sites) {
    throw new UnlighthouseError({
      code: 'NOT_SUPPORTED',
      message: 'sites store is not wired by the host preset',
    })
  }
  return ctx.sites
}

export interface SitesStoreCreateInput {
  name?: string
  url: string
  group?: string | null
  device?: 'mobile' | 'desktop'
}

export interface SitesStore {
  list: () => Promise<Site[]>
  get: (id: string) => Promise<Site | null>
  create: (input: SitesStoreCreateInput) => Promise<Site>
  delete: (id: string) => Promise<boolean>
}

export const sitesList: Handler<typeof SitesList> = {
  command: {} as typeof SitesList,
  async run(_input, ctx) {
    const store = requireStore(ctx as { sites?: SitesStore })
    return { sites: await store.list() } as CommandOutput<typeof SitesList>
  },
}

export const sitesGet: Handler<typeof SitesGet> = {
  command: {} as typeof SitesGet,
  async run(input, ctx) {
    const store = requireStore(ctx as { sites?: SitesStore })
    return { site: await store.get(input.id) } as CommandOutput<typeof SitesGet>
  },
}

export const sitesCreate: Handler<typeof SitesCreate> = {
  command: {} as typeof SitesCreate,
  async run(input, ctx) {
    const store = requireStore(ctx as { sites?: SitesStore })
    return { site: await store.create(input) } as CommandOutput<typeof SitesCreate>
  },
}

export const sitesDelete: Handler<typeof SitesDelete> = {
  command: {} as typeof SitesDelete,
  async run(input, ctx) {
    const store = requireStore(ctx as { sites?: SitesStore })
    const ok = await store.delete(input.id)
    if (!ok) {
      throw new UnlighthouseError({
        code: 'SITE_NOT_FOUND',
        message: `No site found for id=${input.id}`,
      })
    }
    return { id: input.id, deleted: true } as CommandOutput<typeof SitesDelete>
  },
}
