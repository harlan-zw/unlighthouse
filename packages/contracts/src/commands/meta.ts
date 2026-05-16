// meta commands — self-describing surface, health, auditor introspection.
// `manifest` is the load-bearing AI-integration command (v1.md lines 864–880).
// `auditors.list` + `auditors.test` are CLI-hidden; their info surfaces via
// `manifest` output (v1.md line 14).

import { z } from 'zod'
import { CategorySchema, DeviceSchema, UrlSchema } from '../types/atoms'
import { defineCommand } from './define'

// ── manifest ────────────────────────────────────────────────────────────────
export const Manifest = defineCommand({
  name: 'manifest',
  description: 'Self-describing surface: every command, hook, error code, and default config.',
  input: z.object({}),
  output: z.object({
    name: z.literal('unlighthouse'),
    version: z.string(),
    commands: z.array(
      z.object({
        name: z.string(),
        description: z.string(),
        streaming: z.boolean(),
        inputSchema: z.unknown(), // JSON Schema, from z.toJSONSchema()
        outputSchema: z.unknown(),
        exitCodes: z.record(z.string(), z.number()).optional(),
      }),
    ),
    hooks: z.array(
      z.object({
        name: z.string(),
        payloadSchema: z.unknown(),
      }),
    ),
    errors: z.array(
      z.object({
        code: z.string(),
        description: z.string(),
      }),
    ),
    /** Full default config tree (literal `defaultConfig` const from contracts). */
    defaults: z.unknown(),
    /** Auditors known to the host preset; surfaces in lieu of `auditors.list`. */
    auditors: z.array(
      z.object({
        name: z.string(),
        capabilities: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
})

// ── health ──────────────────────────────────────────────────────────────────
export const Health = defineCommand({
  name: 'health',
  description: 'Liveness probe + storage / auditor reachability snapshot.',
  input: z.object({}),
  output: z.object({
    ok: z.boolean(),
    version: z.string(),
    uptimeMs: z.number().nonnegative(),
    storage: z.object({
      rows: z.enum(['ok', 'degraded', 'down']),
      blobs: z.enum(['ok', 'degraded', 'down']),
    }),
    activeScans: z.number().int().nonnegative(),
  }),
})

// ── auditors.list ───────────────────────────────────────────────────────────
// Hidden in CLI per v1.md line 14 — info also surfaces in `manifest`.
export const AuditorsList = defineCommand({
  name: 'auditors.list',
  description: 'List auditors registered by the host preset with their capabilities.',
  input: z.object({}),
  output: z.object({
    auditors: z.array(
      z.object({
        name: z.string(),
        capabilities: z.record(z.string(), z.unknown()),
      }),
    ),
  }),
  cli: { hidden: true },
})

// ── auditors.test ───────────────────────────────────────────────────────────
// Hidden in CLI per v1.md line 14.
export const AuditorsTest = defineCommand({
  name: 'auditors.test',
  description: 'Test an auditor against a single URL and return the raw LH report.',
  input: z.object({
    auditor: z.string(),
    url: UrlSchema,
    device: DeviceSchema.optional(),
    categories: z.array(CategorySchema).optional(),
  }),
  output: z.object({
    ok: z.boolean(),
    durationMs: z.number().nonnegative(),
    lighthouseVersion: z.string().optional(),
    lhr: z.unknown(),
    error: z
      .object({
        code: z.string(),
        message: z.string(),
      })
      .optional(),
  }),
  cli: { hidden: true },
  // Fires a real Lighthouse run against an arbitrary URL — agent-controlled
  // input could SSRF to internal hosts or burn a Chrome slot. Triggering a
  // live audit is what scan.start is for; this is a dev-only diagnostic.
  mcp: { hidden: true },
})
