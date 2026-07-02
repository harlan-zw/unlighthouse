// D-033: agent-facing output mode. Activated by `--agent` or a non-TTY stdout.
// Emits newline-delimited JSON with a `$schema` URL on every object (the D-037
// forward-compat seam), no ANSI, no prompts; maps UnlighthouseError.code to an
// exit code via each command's `exitCodes`.

import { createErrorEnvelope, UnlighthouseError } from '@unlighthouse/contracts/errors'

/** Base URL the emitted JSON Schemas (D-037) are served from. */
export const SCHEMA_BASE_URL = 'https://unlighthouse.dev/schema/v1'

export function schemaUrl(commandName: string, kind: 'input' | 'output'): string {
  return `${SCHEMA_BASE_URL}/${commandName}.${kind}.json`
}

/** True when output should be machine-readable NDJSON rather than human text. */
export function isAgentMode(argv: string[] = process.argv): boolean {
  if (argv.includes('--agent'))
    return true
  if (argv.includes('--no-agent'))
    return false
  return !process.stdout.isTTY
}

/** Stamp a `$schema` URL onto an emitted object (arrays/scalars pass through). */
export function stampSchema(commandName: string, value: unknown): unknown {
  if (value && typeof value === 'object' && !Array.isArray(value))
    return { $schema: schemaUrl(commandName, 'output'), ...(value as Record<string, unknown>) }
  return value
}

/** One NDJSON line to stdout. */
export function writeNdjson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

/**
 * Resolve the process exit code for a failed command. A command's `exitCodes`
 * map (structured-error code -> exit code) wins; otherwise validation failures
 * exit 2 (usage) and everything else exits 1.
 */
export function exitCodeForError(err: unknown, cmd?: { exitCodes?: Record<string, number> }): number {
  if (err instanceof UnlighthouseError) {
    const mapped = cmd?.exitCodes?.[err.code]
    if (typeof mapped === 'number')
      return mapped
    if (err.category === 'validation')
      return 2
  }
  return 1
}

/** Emit a typed error envelope to stderr (NDJSON in agent mode, prettified otherwise). */
export function emitError(err: unknown, agent: boolean): void {
  const envelope = createErrorEnvelope(err, { exposeInternal: process.env.NODE_ENV !== 'production' })
  if (agent) {
    process.stderr.write(`${JSON.stringify({ $schema: `${SCHEMA_BASE_URL}/error.json`, ...envelope })}\n`)
    return
  }
  const e = envelope.error
  process.stderr.write(`[${e.code}] ${e.message}\n`)
}
