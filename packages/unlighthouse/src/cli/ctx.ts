// D-033: build a per-invocation HandlerCtx for projected CLI subcommands
// (`unlighthouse scan start`, `query routes`, `manifest`, …). Mirrors the MCP
// entrypoint's wiring (cli/mcp.ts): resolve config, select the same persisted
// scan directory, then open the shared local runtime.

import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { createConsola } from 'consola'
import { version } from '../../package.json'
import { resolveConfig } from '../config/resolve'
import { createLocalRuntime } from '../local-runtime'
import { resolveScanDirectory } from './scan-directory'

export interface CliContextFlags {
  site?: string
  root?: string
  debug?: boolean
  env?: NodeJS.ProcessEnv
}

/** Build a HandlerCtx wired to the on-disk CLI storage for a single subcommand run. */
export async function buildCliContext(flags: CliContextFlags = {}): Promise<HandlerCtx> {
  const env = flags.env ?? process.env
  const { config, packs: configPacks } = await resolveConfig({
    overrides: flags.site ? { site: flags.site } : undefined,
    cwd: flags.root,
    env,
  })
  const logger = createConsola({ defaults: { level: flags.debug ? 4 : 1 } }).withTag('unlighthouse-cli')
  const output = resolveScanDirectory({
    outputRoot: config.outputPath as string,
    site: config.site,
    config,
    version,
  })
  const runtime = await createLocalRuntime({
    config,
    output: { path: output.path },
    logger,
    env,
    packs: configPacks,
  })
  return runtime.handlerCtx
}
