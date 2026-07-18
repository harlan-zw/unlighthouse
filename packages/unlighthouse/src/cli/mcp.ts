// Entry point for `unlighthouse-mcp` (bin) and `unlighthouse mcp` (subcommand).
// Boots a stdio MCP server projecting the command registry.
//
// Storage is the same drizzle+unstorage stack the HTTP host uses, pointed at
// the resolved `outputPath`. That means MCP clients see the user's real scan
// history, cached pack runs, and blob-stored LHRs — not an empty in-memory
// world. Without this, history.list returns [] and pack.run can't be invoked
// because there's no scanId to feed it.

import type { ArgsDef } from 'citty'
import { isAbsolute, resolve } from 'node:path'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { startStdioServer } from '@unlighthouse/mcp'
import { parseArgs } from 'citty'
import { createConsola } from 'consola'
import { version } from '../../package.json'
import { resolveConfig } from '../config/resolve'
import { createLocalRuntime } from '../local-runtime'
import { resolveScanDirectory } from './scan-directory'

const MCP_ARGS = {
  site: { type: 'string', alias: 's' },
  root: { type: 'string', alias: 'r' },
  debug: { type: 'boolean', alias: 'd' },
} satisfies ArgsDef

export interface McpFlags {
  site?: string
  root?: string
  debug: boolean
}

export class McpUsageError extends Error {
  readonly exitCode = 2
}

/** Parse the MCP bin's small flag surface through the same citty seam as CLI. */
export function parseMcpFlags(argv: string[]): McpFlags {
  const parsed = parseArgs(argv, MCP_ARGS) as Record<string, unknown>
  const stringFlag = (name: 'site' | 'root'): string | undefined => {
    const value = parsed[name]
    if (value === undefined)
      return undefined
    if (typeof value !== 'string' || value.length === 0)
      throw new McpUsageError(`missing value for --${name}`)
    return value
  }
  return {
    site: stringFlag('site'),
    root: stringFlag('root'),
    debug: parsed.debug === true,
  }
}

// Resolve --root to an absolute path under CWD. Prevents `--root ../../../`
// from silently relocating `.unlighthouse` outside the project. If a user
// genuinely needs an absolute path elsewhere, they can pass one — we honour
// absolutes verbatim but refuse relatives that escape CWD.
function sanitiseRoot(raw: string): string {
  const abs = isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
  const cwd = process.cwd()
  if (!isAbsolute(raw) && !abs.startsWith(`${cwd}/`) && abs !== cwd)
    throw new McpUsageError(`--root resolves outside CWD: ${abs}`)
  return abs
}

export async function runMcp(argv: string[] = process.argv.slice(2), env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const flags = parseMcpFlags(argv)
  const debugMode = flags.debug
  const diag = (message: string): void => {
    if (debugMode)
      process.stderr.write(message)
  }
  const rootDir = flags.root ? sanitiseRoot(flags.root) : undefined
  const { config, packs: configPacks } = await resolveConfig({
    overrides: flags.site ? { site: flags.site } : undefined,
    cwd: rootDir,
    env,
  })

  // D-018: host owns the concrete consola; tagged children pass into each
  // adapter. MCP routes consola → stderr only (stdout is the JSON-RPC channel).
  // --debug raises consola to verbose so the user sees migration / drizzle /
  // storage chatter alongside the discover diagnostics.
  const logger = createConsola({ defaults: { level: debugMode ? 4 : 1 } }).withTag('unlighthouse-mcp')

  const output = resolveScanDirectory({
    outputRoot: config.outputPath as string,
    site: config.site,
    config,
    version,
  })
  for (const message of output.diagnostics)
    diag(`[unlighthouse-mcp] ${message}\n`)
  const outputPath = output.path
  // Diagnostic to stderr (stdout is the JSON-RPC channel and must stay clean).
  // Gated by --debug so production agents don't see internal paths by default.
  diag(`[unlighthouse-mcp] outputPath=${outputPath}\n`)

  const runtime = await createLocalRuntime({
    config,
    output: { path: outputPath },
    logger,
    env,
    packs: configPacks,
  })

  await startStdioServer({
    handlers: createHandlers(),
    ctx: runtime.handlerCtx,
    identity: { name: 'unlighthouse', version },
    exposeInternal: debugMode,
  })
}

// Auto-run when invoked as the bin entry.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('unlighthouse-mcp.mjs')) {
  runMcp().catch((err) => {
    process.stderr.write(`[unlighthouse-mcp] ${err?.message ?? err}\n`)
    process.exit(err instanceof McpUsageError ? err.exitCode : 1)
  })
}
