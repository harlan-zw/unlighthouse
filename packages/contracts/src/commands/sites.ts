// sites.* commands — persistent multi-site registry managed by the host.
// Sites are user-curated targets surfaced in the dashboard; scans/history are
// joined against them by URL.

import { z } from 'zod'
import { Device, Url } from '../types/atoms'
import { defineCommand } from './define'

export const Site = z.object({
  id: z.string(),
  name: z.string(),
  url: Url,
  group: z.string().nullable(),
  device: Device,
  createdAt: z.iso.datetime(),
})
export type Site = z.infer<typeof Site>

export const SitesList = defineCommand({
  name: 'sites.list',
  description: 'List the persisted sites managed by this host.',
  input: z.object({}),
  output: z.object({ sites: z.array(Site) }),
})

export const SitesGet = defineCommand({
  name: 'sites.get',
  description: 'Get a single site by id.',
  input: z.object({ id: z.string() }),
  output: z.object({ site: Site.nullable() }),
})

export const SitesCreate = defineCommand({
  name: 'sites.create',
  description: 'Create (or upsert by id) a site.',
  input: z.object({
    name: z.string().optional(),
    url: Url,
    group: z.string().nullable().optional(),
    device: Device.optional(),
  }),
  output: z.object({ site: Site }),
  // Persistent registry mutation. Adding ghost sites across restarts is a
  // hostile-agent vector; site setup belongs in the UI / CLI.
  mcp: { hidden: true },
})

export const SitesDelete = defineCommand({
  name: 'sites.delete',
  description: 'Delete a site by id.',
  input: z.object({ id: z.string() }),
  output: z.object({ id: z.string(), deleted: z.literal(true) }),
  exitCodes: { SITE_NOT_FOUND: 64 },
  // Destructive — pairs with history.delete in the "agent has no business
  // deleting user data" category.
  mcp: { hidden: true },
})
