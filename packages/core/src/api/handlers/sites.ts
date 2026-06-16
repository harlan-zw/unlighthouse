import type {
  CommandOutput,
  SitesCreate,
  SitesDelete,
  SitesList,
} from '@unlighthouse/contracts'
import type { Handler } from './types'
import { UnlighthouseError } from '@unlighthouse/contracts'
import { deriveSiteId, deriveSiteName } from '../../util/site'

export const sitesList: Handler<typeof SitesList> = {
  command: {} as typeof SitesList,
  async run(_input, ctx) {
    const sites = await ctx.storage.sites.list()
    return { sites } as CommandOutput<typeof SitesList>
  },
}

export const sitesCreate: Handler<typeof SitesCreate> = {
  command: {} as typeof SitesCreate,
  async run(input, ctx) {
    const id = deriveSiteId(input.url)
    const existing = await ctx.storage.sites.get(id)
    if (existing) {
      const updated = await ctx.storage.sites.update(id, {
        name: input.name ?? existing.name,
        url: input.url,
        group: input.group === undefined ? existing.group : input.group,
      })
      return { site: updated! } as CommandOutput<typeof SitesCreate>
    }
    const site = await ctx.storage.sites.create({
      id,
      name: input.name || deriveSiteName(input.url),
      url: input.url,
      group: input.group ?? null,
      createdAt: new Date().toISOString(),
    })
    return { site } as CommandOutput<typeof SitesCreate>
  },
}

export const sitesDelete: Handler<typeof SitesDelete> = {
  command: {} as typeof SitesDelete,
  async run(input, ctx) {
    const ok = await ctx.storage.sites.delete(input.id)
    if (!ok) {
      throw new UnlighthouseError({
        code: 'SITE_NOT_FOUND',
        message: `No site found for id=${input.id}`,
      })
    }
    return { id: input.id, deleted: true } as CommandOutput<typeof SitesDelete>
  },
}
