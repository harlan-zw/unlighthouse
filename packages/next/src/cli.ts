#!/usr/bin/env node
/**
 * `unlighthouse-next` bin — for users who'd rather not wrap their
 * `next.config.js`. Run after `next build && next start`:
 *
 *   pnpm dlx unlighthouse-next --site http://localhost:3000
 *
 * This is intentionally minimal — it just forwards to `runScan()`. Any
 * heavier orchestration (auto-spawning `next start`, awaiting readiness,
 * tearing it down after) is a follow-up tied to the Phase 15 middleware
 * bullet.
 */

import process from 'node:process'
import { runScan } from './index'

interface CliArgs {
  site?: string
  outputPath?: string
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {}
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--site' || arg === '-s') {
      args.site = argv[++i]
    }
    else if (arg.startsWith('--site=')) {
      args.site = arg.slice('--site='.length)
    }
    else if (arg === '--output-path' || arg === '-o') {
      args.outputPath = argv[++i]
    }
    else if (arg.startsWith('--output-path=')) {
      args.outputPath = arg.slice('--output-path='.length)
    }
    else if (arg === '--help' || arg === '-h') {
      printHelp()
      process.exit(0)
    }
  }
  return args
}

function printHelp(): void {
  console.log(`unlighthouse-next — scan a Next.js app with Unlighthouse.

Usage:
  unlighthouse-next [options]

Options:
  -s, --site <url>           Site to scan (default: $UNLIGHTHOUSE_SITE or http://localhost:3000)
  -o, --output-path <path>   Where to write the report
  -h, --help                 Show this help

Run \`next build && next start\` first, then point this at the running server.`)
}

async function main(): Promise<void> {
  if (process.env.UNLIGHTHOUSE_SKIP === 'true') {
    console.log('[unlighthouse:next] UNLIGHTHOUSE_SKIP=true — skipping scan.')
    return
  }
  const args = parseArgs(process.argv.slice(2))
  await runScan({
    site: args.site,
    outputPath: args.outputPath,
  })
}

main().catch((err) => {
  console.error('[unlighthouse:next] cli failed:', err)
  process.exit(1)
})
