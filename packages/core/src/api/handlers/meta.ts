// meta handlers: manifest, health, auditors.list.

import type {
  AuditorsList,
  CommandOutput,
  Health,
  Manifest,
  Ready,
} from '@unlighthouse/contracts/commands'
import type { Handler } from './types'
import { commands } from '@unlighthouse/contracts/commands'
import { defaultConfig } from '@unlighthouse/contracts/config'
import { ErrorCodeDescriptions, ErrorCodes, UnlighthouseErrorEnvelopeSchema } from '@unlighthouse/contracts/errors'
import { HookSchemas } from '@unlighthouse/contracts/hooks'
import { z } from 'zod'

function toJsonSchema(schema: z.ZodType): unknown {
  // Zod v4 ships `z.toJSONSchema`; fall back to a placeholder on older v3.
  const toJSON = (z as unknown as { toJSONSchema?: (s: z.ZodType) => unknown }).toJSONSchema
  return toJSON ? toJSON(schema) : { $todo: 'zod-toJSONSchema-unavailable' }
}

// D-037: base URL the published JSON Schema files are served from. Kept in
// lockstep with `SCHEMA_BASE_URL` in packages/unlighthouse/src/cli/agent-mode.ts
// and packages/contracts/scripts/emit-schemas.ts (all three describe the same
// files). Hardcoded rather than imported to avoid core depending on the CLI
// package; if it drifts, the contracts parity/manifest tests catch it.
const SCHEMA_BASE_URL = 'https://unlighthouse.dev/schema/v1'

// D-037: the raw-binary dashboard endpoints (see core/src/api/dashboard.ts).
// Paths are relative to the dashboard router's own mount base (`/dashboard`);
// the CLI host serves them under `/api/dashboard`, Cloudflare under `/dashboard`.
const BINARY_ENDPOINTS = [
  { method: 'GET', path: '/dashboard/screenshot/{scanId}/{path}', description: 'Route screenshot (image/webp, falls back to the LHR full-page JPEG).', binary: true },
  { method: 'GET', path: '/dashboard/route/{scanId}/{path}', description: 'Reconciled route detail contract for one (scanId, path[, device]).', binary: true },
  { method: 'GET', path: '/dashboard/lhr/{scanId}/{path}', description: 'Raw gunzipped Lighthouse JSON for one route (the receipts escape hatch).', binary: true },
  { method: 'GET', path: '/dashboard/export/{scanId}', description: 'Full-scan export bundle (JSON or ?format=csv) of every route + pack run.', binary: true },
] as const

// INTERNAL: not used by the UI; kept for API discovery and tooling integration.
export const manifest: Handler<typeof Manifest> = {
  command: {} as typeof Manifest,
  async run(_input, ctx) {
    const commandList = Object.values(commands).map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      streaming: !!cmd.streaming,
      inputSchema: toJsonSchema(cmd.input),
      outputSchema: toJsonSchema(cmd.output),
      inputSchemaUrl: `${SCHEMA_BASE_URL}/${cmd.name}.input.json`,
      outputSchemaUrl: `${SCHEMA_BASE_URL}/${cmd.name}.output.json`,
      exitCodes: cmd.exitCodes,
    }))

    const hooks = Object.entries(HookSchemas).map(([name, payload]) => ({
      name,
      payloadSchema: toJsonSchema(payload as z.ZodType),
    }))

    const errors = Object.values(ErrorCodes).map(code => ({
      code,
      description: ErrorCodeDescriptions[code],
    }))

    const auditors = (ctx.auditors?.list() ?? []).map(a => ({
      name: a.name,
      capabilities: {} as Record<string, unknown>,
    }))

    return {
      name: 'unlighthouse',
      version: ctx.version,
      schemaBaseUrl: SCHEMA_BASE_URL,
      commands: commandList,
      binaryEndpoints: BINARY_ENDPOINTS.map(e => ({ ...e })),
      hooks,
      errors,
      errorEnvelopeSchema: toJsonSchema(UnlighthouseErrorEnvelopeSchema),
      defaults: defaultConfig,
      auditors,
    } as CommandOutput<typeof Manifest>
  },
}

export const health: Handler<typeof Health> = {
  command: {} as typeof Health,
  async run(_input, ctx) {
    const rows = await ctx.storage.scans.list({ page: 1, pageSize: 1 })
      .then(() => 'ok' as const)
      .catch(_err => 'down' as const)
    const blobs = await ctx.storage.blobs.has('__probe__')
      .then(() => 'ok' as const)
      .catch(_err => 'down' as const)
    return {
      ok: rows === 'ok' && blobs === 'ok',
      version: ctx.version,
      uptimeMs: Math.round(process.uptime() * 1000),
      storage: { rows, blobs },
      activeScans: ctx.core.session() ? 1 : 0,
    } as CommandOutput<typeof Health>
  },
}

export const ready: Handler<typeof Ready> = {
  command: {} as typeof Ready,
  run: health.run,
}

export const auditorsList: Handler<typeof AuditorsList> = {
  command: {} as typeof AuditorsList,
  async run(_input, ctx) {
    return {
      auditors: (ctx.auditors?.list() ?? []).map(a => ({
        name: a.name,
        capabilities: {} as Record<string, unknown>,
      })),
    } as CommandOutput<typeof AuditorsList>
  },
}
