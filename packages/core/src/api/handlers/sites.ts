import type { Handler } from './types'
import { SitesCreate, SitesDelete, SitesList } from '@unlighthouse/contracts/commands'
import { UnlighthouseError } from '@unlighthouse/contracts/errors'
import { deriveSiteId, deriveSiteName } from '../../util/site'

export const sitesList: Handler<typeof SitesList> = {
  command: SitesList,
  async run(_input, ctx) {
    const sites = await ctx.storage.sites.list()
    return SitesList.output.parse({ sites })
  },
}

export const sitesCreate: Handler<typeof SitesCreate> = {
  command: SitesCreate,
  async run(input, ctx) {
    const id = deriveSiteId(input.url)
    const existing = await ctx.storage.sites.get(id)
    if (existing) {
      const updated = await ctx.storage.sites.update(id, {
        name: input.name ?? existing.name,
        url: input.url,
        group: input.group === undefined ? existing.group : input.group,
      })
      if (!updated) {
        throw new UnlighthouseError({
          code: 'SITE_NOT_FOUND',
          message: `Site disappeared while updating id=${id}`,
        })
      }
      return SitesCreate.output.parse({ site: updated })
    }
    const site = await ctx.storage.sites.create({
      id,
      name: input.name || deriveSiteName(input.url),
      url: input.url,
      group: input.group ?? null,
      createdAt: new Date().toISOString(),
    })
    return SitesCreate.output.parse({ site })
  },
}

export const sitesDelete: Handler<typeof SitesDelete> = {
  command: SitesDelete,
  async run(input, ctx) {
    const ok = await ctx.storage.sites.delete(input.id)
    if (!ok) {
      throw new UnlighthouseError({
        code: 'SITE_NOT_FOUND',
        message: `No site found for id=${input.id}`,
      })
    }
    return SitesDelete.output.parse({ id: input.id, deleted: true })
  },
}
