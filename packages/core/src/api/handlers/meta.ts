// meta handlers: manifest, health, auditors.list, auditors.test.

import type {
  AuditorsList,
  AuditorsTest,
  CommandOutput,
  Health,
  Manifest,
} from '@unlighthouse/contracts'
import type { Handler } from './types'
import {
  commands,
  defaultConfig,
  ErrorCodeDescriptions,
  ErrorCodes,
  HookSchemas,
} from '@unlighthouse/contracts'
import { z } from 'zod'

function toJsonSchema(schema: z.ZodType): unknown {
  // Zod v4 ships `z.toJSONSchema`; fall back to a placeholder on older v3.
  const toJSON = (z as unknown as { toJSONSchema?: (s: z.ZodType) => unknown }).toJSONSchema
  return toJSON ? toJSON(schema) : { $todo: 'zod-toJSONSchema-unavailable' }
}

export const manifest: Handler<typeof Manifest> = {
  command: {} as typeof Manifest,
  async run(_input, ctx) {
    const commandList = Object.values(commands).map(cmd => ({
      name: cmd.name,
      description: cmd.description,
      streaming: !!cmd.streaming,
      inputSchema: toJsonSchema(cmd.input),
      outputSchema: toJsonSchema(cmd.output),
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
      commands: commandList,
      hooks,
      errors,
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
      .catch(() => 'down' as const)
    const blobs = await ctx.storage.blobs.has('__probe__')
      .then(() => 'ok' as const)
      .catch(() => 'down' as const)
    return {
      ok: rows === 'ok' && blobs === 'ok',
      version: ctx.version,
      uptimeMs: Math.round(process.uptime() * 1000),
      storage: { rows, blobs },
      activeScans: ctx.core.session() ? 1 : 0,
    } as CommandOutput<typeof Health>
  },
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

export const auditorsTest: Handler<typeof AuditorsTest> = {
  command: {} as typeof AuditorsTest,
  async run(input, ctx) {
    if (!ctx.auditors?.test) {
      return {
        ok: false,
        durationMs: 0,
        lhr: null,
        error: { code: 'NOT_SUPPORTED', message: 'auditors.test is not wired by the host preset' },
      } as CommandOutput<typeof AuditorsTest>
    }
    const start = Date.now()
    const info = await ctx.auditors.test(input.auditor)
    return {
      ok: info.ok ?? true,
      durationMs: Date.now() - start,
      lhr: null,
    } as CommandOutput<typeof AuditorsTest>
  },
}
