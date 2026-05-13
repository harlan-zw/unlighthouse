import type { Logger, Storage } from '@unlighthouse/contracts'
import type {
  ClientOptionsPayload,
  GenerateClientOptions,
  ResolvedUserConfig,
  RuntimeSettings,
  ScanMeta,
} from './types'
import { dirname, join, resolve } from 'node:path'
import fs from 'fs-extra'
import { pick } from 'lodash-es'
import { withLeadingSlash, withTrailingSlash } from 'ufo'

export interface GenerateClientDeps {
  resolvedConfig: ResolvedUserConfig
  runtimeSettings: RuntimeSettings
  storage: Storage
  logger?: Logger
}

/**
 * Copies the file contents of the @unlighthouse/ui package and does
 * transformation based on the provided configuration. Reads scan/route data
 * from the v1 `Storage` port; the legacy `worker.reports()` in-memory cache
 * is gone.
 *
 * Static builds embed the per-route payload as JSON; the LHR blobs the UI
 * fetches on demand still come from `storage.blobs` via the runtime API.
 */
export async function generateClient(options: GenerateClientOptions = {}, deps: GenerateClientDeps) {
  const { runtimeSettings, resolvedConfig, storage, logger } = deps

  let prefix = withTrailingSlash(withLeadingSlash(resolvedConfig.routerPrefix))
  if (prefix === '/') {
    prefix = ''
  }
  const clientPathFolder = dirname(runtimeSettings.resolvedClientPath)

  logger?.debug(`Copying client from ${clientPathFolder} to ${runtimeSettings.generatedClientPath}`)
  await fs.copy(clientPathFolder, runtimeSettings.generatedClientPath)

  const inlineScript = `window.__unlighthouse_static = ${!!options.static}`
  let indexHTML = await fs.readFile(runtimeSettings.resolvedClientPath, 'utf-8')

  const payloadScript = `<script src="${prefix}assets/payload.js"></script>`
  const inlineScriptTag = `<script data-unlighthouse-inline>${inlineScript}</script>`
  if (indexHTML.includes('</head>')) {
    indexHTML = indexHTML.replace('</head>', `${payloadScript}${inlineScriptTag}</head>`)
  }

  if (prefix) {
    indexHTML = indexHTML
      .replace(/(href|src)="\/assets\/(.*?)"/g, `$1="${prefix}assets/$2"`)
      .replace(/(href|src)="\/_nuxt\/(.*?)"/g, `$1="${prefix}_nuxt/$2"`)
      .replace(/(href|src)="\/_fonts\/(.*?)"/g, `$1="${prefix}_fonts/$2"`)
  }

  await fs.writeFile(resolve(runtimeSettings.generatedClientPath, 'index.html'), indexHTML, 'utf-8')

  // Resolve current scan via runtimeSettings; absent → empty payload.
  const scanId = runtimeSettings.currentScanId
  let routes: Awaited<ReturnType<Storage['routes']['listForScan']>>['items'] = []
  let scanMeta: ScanMeta = { favicon: undefined, monitor: null as never, routes: 0, score: 0 }

  if (scanId) {
    const list = await storage.routes.listForScan(scanId as never, { pageSize: 10_000 })
    routes = list.items
    const scoreValues = routes.map(r => r.scorePerformance).filter((s): s is number => s != null)
    const score = scoreValues.length ? scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length : 0
    scanMeta = {
      favicon: undefined,
      monitor: null as never,
      routes: routes.length,
      score,
    }
  }

  const staticData: { options: ClientOptionsPayload, scanMeta: ScanMeta, reports: unknown[] } = {
    reports: options.static ? routes : [],
    scanMeta,
    options: pick({
      ...runtimeSettings,
      ...resolvedConfig,
    }, [
      'client',
      'site',
      'websocketUrl',
      'lighthouseOptions',
      'scanner',
      'routerPrefix',
      'websocketUrl',
      'apiUrl',
    ]),
  }
  staticData.options.lighthouseOptions = { onlyCategories: resolvedConfig.lighthouseOptions.onlyCategories }

  const assetsDir = join(runtimeSettings.generatedClientPath, 'assets')
  await fs.ensureDir(assetsDir)
  await fs.writeFile(
    join(assetsDir, 'payload.js'),
    `window.__unlighthouse_payload = ${JSON.stringify(staticData)}`,
    { encoding: 'utf-8' },
  )

  logger?.debug('Client generated successfully')
}
