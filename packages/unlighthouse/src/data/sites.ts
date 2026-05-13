// Persistent sites registry — JSON file in the unlighthouse output path.

import type { Site } from '@unlighthouse/contracts'
import type { SitesStore, SitesStoreCreateInput } from '@unlighthouse/core/api/handlers'
import { join } from 'node:path'
import fs from 'fs-extra'

interface FileShape {
  version: 1
  sites: Site[]
}

function emptyFile(): FileShape {
  return { version: 1, sites: [] }
}

function deriveId(url: string): string {
  return encodeURIComponent(new URL(url).hostname)
}

function deriveName(url: string): string {
  return new URL(url).hostname
}

export interface CreateSitesStoreOptions {
  outputPath: string
}

export function createSitesStore({ outputPath }: CreateSitesStoreOptions): SitesStore {
  const file = join(outputPath, 'sites.json')

  async function read(): Promise<FileShape> {
    const exists = await fs.pathExists(file)
    if (!exists)
      return emptyFile()
    return fs.readJson(file).catch(() => emptyFile())
  }

  async function write(data: FileShape): Promise<void> {
    await fs.ensureDir(outputPath)
    await fs.writeJson(file, data, { spaces: 2 })
  }

  return {
    async list() {
      const data = await read()
      return data.sites
    },
    async get(id) {
      const data = await read()
      return data.sites.find(s => s.id === id) ?? null
    },
    async create(input: SitesStoreCreateInput) {
      const data = await read()
      const id = deriveId(input.url)
      const existing = data.sites.find(s => s.id === id)
      if (existing) {
        const merged: Site = {
          ...existing,
          name: input.name ?? existing.name,
          url: input.url,
          group: input.group === undefined ? existing.group : input.group,
          device: input.device ?? existing.device,
        }
        data.sites = data.sites.map(s => (s.id === id ? merged : s))
        await write(data)
        return merged
      }
      const site: Site = {
        id,
        name: input.name || deriveName(input.url),
        url: input.url,
        group: input.group ?? null,
        device: input.device ?? 'mobile',
        createdAt: new Date().toISOString(),
      }
      data.sites = [...data.sites, site]
      await write(data)
      return site
    },
    async delete(id) {
      const data = await read()
      const before = data.sites.length
      data.sites = data.sites.filter(s => s.id !== id)
      if (data.sites.length === before)
        return false
      await write(data)
      return true
    },
  }
}

export { deriveId as deriveSiteId }
