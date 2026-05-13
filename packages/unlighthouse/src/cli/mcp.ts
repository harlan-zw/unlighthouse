// Entry point for `unlighthouse-mcp` (bin) and `unlighthouse mcp` (subcommand).
// Boots a stdio MCP server projecting the 22-command registry.

import type { UnlighthouseConfig } from '@unlighthouse/contracts'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { createHandlers } from '@unlighthouse/core/api/handlers'
import { crawleeCrawler } from '@unlighthouse/core/crawlers'
import { fuseSeeds, manualSeeds } from '@unlighthouse/core/seeds'
import { memoryStorage } from '@unlighthouse/core/storage/memory'
import { startStdioServer } from '@unlighthouse/mcp'
import { createConsola } from 'consola'
import { version } from '../../package.json'
import { resolveAuditor } from '../auditor'
import { resolveConfig } from '../config/resolve'

function resolveManualUrls(urls: UnlighthouseConfig['urls']): string[] | (() => string[] | Promise<string[]>) {
  if (typeof urls === 'function') {
    return async () => {
      const result = await urls()
      return Array.isArray(result) ? result.filter((url): url is string => typeof url === 'string') : []
    }
  }
  return urls ?? []
}

export async function runMcp(): Promise<void> {
  const { config } = await resolveConfig()

  // D-018: host owns the concrete consola; tagged children pass into each adapter.
  const logger = createConsola().withTag('unlighthouse')

  const storage = memoryStorage({ logger: logger.withTag('storage/memory') as never })
  const auditor = resolveAuditor({ config, logger })
  const crawler = crawleeCrawler({ logger: logger.withTag('crawler/crawlee') as never })
  const seeds = fuseSeeds([
    manualSeeds({ urls: resolveManualUrls(config.urls), logger: logger.withTag('seeds/manual') as never }),
  ])
  const core = createUnlighthouseCore({
    config,
    auditor,
    seeds,
    crawler,
    storage,
    logger,
  })

  await startStdioServer({
    handlers: createHandlers(),
    ctx: {
      core,
      auditor,
      storage,
      config,
      version,
    },
    identity: { name: 'unlighthouse', version },
  })
}

// Auto-run when invoked as the bin entry.
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('unlighthouse-mcp.mjs')) {
  runMcp().catch((err) => {
    process.stderr.write(`[unlighthouse-mcp] ${err?.message ?? err}\n`)
    process.exit(1)
  })
}
