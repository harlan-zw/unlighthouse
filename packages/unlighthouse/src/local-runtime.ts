import type { Logger } from '@unlighthouse/contracts'
import type { UnlighthouseConfig } from '@unlighthouse/contracts/config'
import type { Pack } from '@unlighthouse/contracts/packs'
import type { Storage, UnlighthouseCore } from '@unlighthouse/contracts/ports'
import type { HandlerCtx } from '@unlighthouse/core/api/handlers'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { logOperationalWarn } from '@unlighthouse/contracts/logging'
import { createUnlighthouseCore } from '@unlighthouse/core'
import { crawleeCrawler } from '@unlighthouse/core/crawlers'
import { createCruxPack, createPackRegistry } from '@unlighthouse/core/packs'
import { reapStaleScans } from '@unlighthouse/core/runtime'
import { fuseSeeds, manualSeeds, sitemapSeeds } from '@unlighthouse/core/seeds'
import { routeDefinitionSeeds } from '@unlighthouse/core/seeds/route-definitions'
import { version } from '../package.json'
import { resolveAuditor } from './auditor'
import { initStorage } from './cli/storage-init'

export interface CreateLocalRuntimeOptions {
  config: UnlighthouseConfig
  output: {
    path: string
    mode?: 'preserve' | 'reset'
  }
  logger: Logger
  env: NodeJS.ProcessEnv
  /** Non-environment packs in ascending precedence order. */
  packs?: readonly Pack[]
}

export interface LocalRuntime {
  readonly core: UnlighthouseCore
  readonly storage: Storage
  readonly handlerCtx: HandlerCtx
}

function normaliseConfiguredUrls(urls: readonly string[], site?: string): string[] {
  const normalised = urls.flatMap((rawUrl) => {
    const url = rawUrl.trim()
    if (!url)
      return []
    try {
      return [new URL(url, site).toString()]
    }
    catch (_err) {
      // Leave malformed values intact so the crawler can surface a fatal,
      // actionable error instead of silently dropping configured input.
      return [url]
    }
  })
  return [...new Set(normalised)]
}

export function configuredUrls(config: UnlighthouseConfig): string[] | (() => Promise<string[]>) {
  const site = config.site && config.site !== 'http://localhost' ? config.site : undefined
  if (typeof config.urls === 'function') {
    const resolveUrls = config.urls
    return async () => {
      const urls = await resolveUrls()
      const configured = Array.isArray(urls) ? urls.filter((url): url is string => typeof url === 'string') : []
      return normaliseConfiguredUrls(configured, site)
    }
  }
  const configured = config.urls?.length ? config.urls : site ? [site] : []
  return normaliseConfiguredUrls(configured, site)
}

function resolveSeeds(config: UnlighthouseConfig, logger: Logger) {
  const site = config.site || ''
  const isDashboardPlaceholder = site === 'http://localhost'
  const sources = [manualSeeds({
    urls: configuredUrls(config),
    logger: logger.withTag('seeds/manual'),
  })]

  let routeMatcher: ((url: string) => string | null) | undefined
  if (config.routeDefinitions) {
    try {
      const source = routeDefinitionSeeds({
        pagesDir: config.routeDefinitions.pagesDir,
        framework: config.routeDefinitions.framework,
        extensions: config.routeDefinitions.extensions,
        site: site || undefined,
        logger: logger.withTag('seeds/route-definitions'),
      })
      routeMatcher = source.matcher
      sources.push(source)
    }
    catch (err) {
      logOperationalWarn('seeds.route_definitions_wire_failed', err, {
        pagesDir: config.routeDefinitions.pagesDir,
      }, logger)
    }
  }

  const hasExplicitUrls = typeof config.urls === 'function' || (config.urls?.length ?? 0) > 0
  const sitemapEnabled = config.scanner?.sitemap !== false && !hasExplicitUrls && !isDashboardPlaceholder
  if (sitemapEnabled && site) {
    try {
      sources.push(sitemapSeeds({
        resolvedConfig: config,
        siteUrl: new URL(site),
        sitemaps: Array.isArray(config.scanner?.sitemap) ? config.scanner.sitemap : true,
        logger: logger.withTag('seeds/sitemap'),
      }))
    }
    catch (err) {
      logOperationalWarn('seeds.sitemap_wire_failed', err, { site }, logger)
    }
  }

  return { seeds: fuseSeeds(sources), routeMatcher }
}

/** Compose the complete Node-local runtime shared by host, CLI, and MCP. */
export async function createLocalRuntime(opts: CreateLocalRuntimeOptions): Promise<LocalRuntime> {
  const outputPath = opts.output.path
  if (opts.output.mode === 'reset' && existsSync(outputPath)) {
    try {
      rmSync(outputPath, { recursive: true, force: true })
    }
    catch (err) {
      logOperationalWarn('host.output_cleanup_failed', err, { outputPath }, opts.logger)
    }
  }
  mkdirSync(outputPath, { recursive: true })

  const { storage } = await initStorage({ outputPath, logger: opts.logger, env: opts.env })
  void reapStaleScans(storage, opts.logger).catch((err) => {
    logOperationalWarn('core.stale_scan_reap_failed', err, { outputPath }, opts.logger)
  })

  const chromeFlags = (opts.env.CHROME_FLAGS ?? '').split(/\s+/).filter(Boolean)
  const auditor = resolveAuditor({ config: opts.config, logger: opts.logger, chromeFlags })
  const environmentPacks = opts.env.CRUX_API_KEY ? [createCruxPack({ apiKey: opts.env.CRUX_API_KEY })] : []
  const packs = [...environmentPacks, ...(opts.packs ?? [])]
  const { seeds, routeMatcher } = resolveSeeds(opts.config, opts.logger)
  const crawler = crawleeCrawler({ logger: opts.logger.withTag('crawler/crawlee') })
  const core = createUnlighthouseCore({
    config: opts.config,
    auditor,
    seeds,
    routeMatcher,
    crawler,
    storage,
    packs,
    logger: opts.logger,
  })
  const handlerCtx: HandlerCtx = {
    core,
    auditor,
    storage,
    config: opts.config,
    version,
    packs: createPackRegistry(packs),
  }
  return { core, storage, handlerCtx }
}
