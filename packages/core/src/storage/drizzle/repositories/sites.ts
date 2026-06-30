// Sites repository — Drizzle backing for the `sites` table introduced by
// the multi-site management commit. Mirrors the memory adapter's shape so the
// Storage port stays adapter-agnostic.

import type { SiteRecord, SiteRepository } from '@unlighthouse/contracts'
import type { DrizzleDatabase } from '../types'
import { sites } from '@unlighthouse/contracts/drizzle'
import { eq } from 'drizzle-orm'

export function createSiteRepository(db: DrizzleDatabase): SiteRepository {
  return {
    async list(): Promise<SiteRecord[]> {
      return db.select<SiteRecord>().from(sites)
    },

    async get(id: string): Promise<SiteRecord | null> {
      const [row] = await db.select<SiteRecord>().from(sites).where(eq(sites.id, id)).limit(1)
      return row ?? null
    },

    async getByUrl(url: string): Promise<SiteRecord | null> {
      const [row] = await db.select<SiteRecord>().from(sites).where(eq(sites.url, url)).limit(1)
      return row ?? null
    },

    async create(site: SiteRecord): Promise<SiteRecord> {
      const [row] = await db.insert<SiteRecord>(sites).values({
        id: site.id,
        name: site.name,
        url: site.url,
        group: site.group ?? null,
        createdAt: site.createdAt,
      }).returning()
      return row
    },

    async update(id: string, patch: Partial<Omit<SiteRecord, 'id'>>): Promise<SiteRecord | null> {
      const updates: Record<string, unknown> = {}
      if (patch.name !== undefined)
        updates.name = patch.name
      if (patch.url !== undefined)
        updates.url = patch.url
      if (patch.group !== undefined)
        updates.group = patch.group ?? null
      if (patch.createdAt !== undefined)
        updates.createdAt = patch.createdAt
      if (Object.keys(updates).length === 0)
        return this.get(id)
      const [row] = await db.update<SiteRecord>(sites).set(updates).where(eq(sites.id, id)).returning()
      return row ?? null
    },

    async delete(id: string): Promise<boolean> {
      const result = await db.delete(sites).where(eq(sites.id, id)).returning({ id: sites.id })
      return Array.isArray(result) && result.length > 0
    },
  }
}
