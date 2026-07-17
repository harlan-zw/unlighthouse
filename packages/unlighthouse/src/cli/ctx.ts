// D-033: build a per-invocation HandlerCtx for projected CLI subcommands
// (`unlighthouse scan start`, `query routes`, `manifest`, …). Mirrors the MCP
// entrypoint's wiring (cli/mcp.ts): resolve config, open the same drizzle +
// unstorage stack at the resolved outputPath, mount the auditor + core.
//
// Note: unlike `unlighthouse-mcp`, this does not walk `.unlighthouse/<host>/`
// to auto-discover the busiest scan dir — it uses the resolved outputPath
// directly. Reads of prior history therefore require the same --site/--root the
// scan ran under. (Scan-dir discovery parity with MCP is a follow-up.)

import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { mkdirSync } from 'node:fs'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { createUnlighthouseCore, reapStaleScans } from '@unlighthouse/core'
import { crawleeCrawler } from '@unlighthouse/core/crawlers'
import { createCruxPack, createPackRegistry } from '@unlighthouse/core/packs'
import { fuseSeeds, manualSeeds } from '@unlighthouse/core/seeds'
import { createConsola } from 'consola'
import { version } from '../../package.json'
import { resolveAuditor } from '../auditor'
import { resolveConfig } from '../config/resolve'
import { initStorage } from './storage-init'

export interface CliContextFlags {
  site?: string
  root?: string
  debug?: boolean
}

function manualUrls(urls: UnlighthouseConfig['urls']): string[] {
  return Array.isArray(urls) ? urls.filter((u): u is string => typeof u === 'string') : []
}

/** Build a HandlerCtx wired to the on-disk CLI storage for a single subcommand run. */
export async function buildCliContext(flags: CliContextFlags = {}): Promise<HandlerCtx> {
  const env = process.env
  const { config, packs: configPacks } = await resolveConfig({
    overrides: flags.site ? { site: flags.site } : undefined,
    cwd: flags.root,
    env,
  })
  const logger = createConsola({ defaults: { level: flags.debug ? 4 : 1 } }).withTag('unlighthouse-cli')

  const outputPath = config.outputPath as string
  mkdirSync(outputPath, { recursive: true })
  const { storage } = await initStorage({ outputPath, logger, env })

  reapStaleScans(storage, logger).catch((err) => {
    logOperationalWarn('core.stale_scan_reap_failed', err, { phase: 'cli-subcommand' }, logger)
  })

  const chromeFlags = (env.CHROME_FLAGS ?? '').split(/\s+/).filter(Boolean)
  const auditor = resolveAuditor({ config, logger, chromeFlags })
  const environmentPacks = env.CRUX_API_KEY ? [createCruxPack({ apiKey: env.CRUX_API_KEY })] : []
  const packs = [...environmentPacks, ...(configPacks ?? [])]
  const crawler = crawleeCrawler({ logger: logger.withTag('crawler/crawlee') })
  const seeds = fuseSeeds([
    manualSeeds({ urls: manualUrls(config.urls), logger: logger.withTag('seeds/manual') }),
  ])
  const core = createUnlighthouseCore({ config, auditor, seeds, crawler, storage, logger, packs })

  return { core, auditor, storage, config, version, packs: createPackRegistry(packs) }
}
