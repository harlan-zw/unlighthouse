// D-037: published JSON Schemas + manifest self-description.
// Covers (a) the contracts emit-schemas builder producing valid per-command
// JSON Schema files + the shared atoms bundle, and (b) the `manifest` handler
// output surfacing `schemaBaseUrl`, per-command schema URLs, and the raw-binary
// dashboard endpoints.

import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { commands, Manifest } from '@unlighthouse/contracts/commands'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { describe, expect, it } from 'vitest'
import { buildSchemas, SCHEMA_BASE_URL } from '../packages/contracts/scripts/emit-schemas'

describe('emit-schemas (D-037)', () => {
  const schemas = buildSchemas()

  it('emits an input + output JSON Schema file per command, plus atoms', () => {
    const commandCount = Object.keys(commands).length
    // 2 files per command + 1 shared atoms bundle.
    expect(Object.keys(schemas).length).toBe(commandCount * 2 + 1)
    expect(schemas['atoms.json']).toBeDefined()
  })

  it('produces a valid JSON Schema for a sample command (scan.start.input)', () => {
    const s = schemas['scan.start.input.json']
    expect(s).toBeDefined()
    // Keeps the dialect declaration (unlike the MCP projection which strips it).
    expect(s.$schema).toBe('https://json-schema.org/draft/2020-12/schema')
    expect(s.type).toBe('object')
    expect((s.properties as Record<string, unknown>).site).toBeDefined()
  })

  it('bundles shared atom schemas as $defs', () => {
    const atoms = schemas['atoms.json']
    const defs = atoms.$defs as Record<string, unknown>
    expect(Object.keys(defs).length).toBeGreaterThan(0)
    expect(defs.ScanRouteSchema).toBeDefined()
  })
})

describe('manifest output self-description (D-037)', () => {
  function makeManifestCtx(): HandlerCtx {
    // manifest only reads ctx.version + ctx.auditors; keep the rest minimal.
    return {
      version: '0.0.0-test',
      auditors: {
        list: () => [{ name: 'mock', ok: true }],
        test: async (name: string) => ({ name, ok: true }),
      },
    } as unknown as HandlerCtx
  }

  it('includes schemaBaseUrl, per-command schema URLs, and binary endpoints', async () => {
    const handlers = createHandlers()
    const out = await handlers.manifest.run({}, makeManifestCtx())

    // Validates the extended output schema too.
    const parsed = Manifest.output.safeParse(out)
    expect(parsed.success).toBe(true)

    expect(out.schemaBaseUrl).toBe(SCHEMA_BASE_URL)

    const scanStart = out.commands.find(c => c.name === 'scan.start')!
    expect(scanStart.inputSchemaUrl).toBe(`${SCHEMA_BASE_URL}/scan.start.input.json`)
    expect(scanStart.outputSchemaUrl).toBe(`${SCHEMA_BASE_URL}/scan.start.output.json`)

    expect(out.binaryEndpoints.length).toBeGreaterThan(0)
    expect(out.binaryEndpoints.every(e => e.binary === true)).toBe(true)
    expect(out.binaryEndpoints.some(e => e.path.includes('/lhr/'))).toBe(true)
  })
})
