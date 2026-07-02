// D-037: emit the command registry's Zod schemas as static, versioned JSON
// Schema files at build time. Run after `tsdown` (see package.json `build`).
// The docs site serves the emitted files at
// `https://unlighthouse.dev/schema/v1/*.json`, which is the `$schema` URL
// agent-facing outputs are stamped with (see cli/agent-mode.ts SCHEMA_BASE_URL).
//
// Kept as a plain script (not a package export) — it is a build tool, not
// runtime surface.

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { commands } from '@unlighthouse/contracts/commands'
import * as atoms from '@unlighthouse/contracts/types/atoms'
import { z } from 'zod'

/** Schema format version. Bump when the emitted shape is not backwards-compatible. */
export const SCHEMA_VERSION = 'v1'

/**
 * Public base URL the emitted files are served from. Kept in lockstep with
 * `SCHEMA_BASE_URL` in `packages/unlighthouse/src/cli/agent-mode.ts`; the two
 * describe the same files from opposite ends (this writes them, that stamps
 * references to them).
 */
export const SCHEMA_BASE_URL = `https://unlighthouse.dev/schema/${SCHEMA_VERSION}`

function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  // Zod 4. Mirrors packages/mcp/src/projection.ts, but KEEP `$schema` — these
  // are standalone files and consumers expect the dialect declaration.
  return z.toJSONSchema(schema) as Record<string, unknown>
}

function isZodType(value: unknown): value is z.ZodType {
  return value instanceof z.ZodType
}

/**
 * Build the full set of `<filename> → JSON Schema` entries: one input + one
 * output file per command, plus a single bundled `atoms.json` holding the
 * shared atom schemas as `$defs`. Pure (no filesystem writes) so it can be
 * asserted directly in tests.
 */
export function buildSchemas(): Record<string, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {}

  for (const [name, cmd] of Object.entries(commands)) {
    out[`${name}.input.json`] = toJsonSchema(cmd.input)
    out[`${name}.output.json`] = toJsonSchema(cmd.output)
  }

  // Shared atoms — one bundle so command schemas that reference the same shapes
  // have a single canonical description to point humans/tooling at.
  const defs: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(atoms)) {
    if (key.endsWith('Schema') && isZodType(value))
      defs[key] = toJsonSchema(value)
  }
  out['atoms.json'] = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Unlighthouse shared atoms',
    $defs: defs,
  }

  return out
}

export function emitSchemas(outDir: string): string[] {
  mkdirSync(outDir, { recursive: true })
  const schemas = buildSchemas()
  const written: string[] = []
  for (const [file, schema] of Object.entries(schemas)) {
    const path = join(outDir, file)
    writeFileSync(path, `${JSON.stringify(schema, null, 2)}\n`)
    written.push(path)
  }
  return written
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url))
  const outDir = join(here, '..', 'dist', 'schemas', SCHEMA_VERSION)
  const written = emitSchemas(outDir)

  console.log(`[emit-schemas] wrote ${written.length} JSON Schema files to ${outDir}`)
}

// Only run when invoked as a script (not when imported by a test).
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main()
