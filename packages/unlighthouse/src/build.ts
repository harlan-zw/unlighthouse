import type {
  ClientOptionsPayload,
  GenerateClientOptions,
  ScanMeta,
  UnlighthouseContext,
  UnlighthouseRouteReport,
} from './types'
import { dirname, join, resolve } from 'node:path'
import fs from 'fs-extra'
import { pick } from 'lodash-es'
import { withLeadingSlash, withTrailingSlash } from 'ufo'
import { createScanMeta } from './data/scanMeta'
import { useLogger, useUnlighthouse } from './unlighthouse'

/**
 * Copies the file contents of the @unlighthouse/ui package and does transformation based on the provided configuration.
 *
 * For Nuxt-based client, the output structure is:
 * - index.html (main entry)
 * - _nuxt/ (JS/CSS chunks)
 * - assets/ (static assets like images)
 */
export async function generateClient(options: GenerateClientOptions = {}, unlighthouse?: UnlighthouseContext) {
  const logger = useLogger()
  if (!unlighthouse)
    unlighthouse = useUnlighthouse()

  const { runtimeSettings, resolvedConfig, worker } = unlighthouse

  let prefix = withTrailingSlash(withLeadingSlash(resolvedConfig.routerPrefix))
  if (prefix === '/') {
    prefix = ''
  }
  const clientPathFolder = dirname(runtimeSettings.resolvedClientPath)

  logger.debug(`Copying client from ${clientPathFolder} to ${runtimeSettings.generatedClientPath}`)
  await fs.copy(clientPathFolder, runtimeSettings.generatedClientPath)

  // Inject config into HTML
  const inlineScript = `window.__unlighthouse_static = ${!!options.static}`
  let indexHTML = await fs.readFile(runtimeSettings.resolvedClientPath, 'utf-8')

  // Inject payload script and inline config before closing head tag
  const payloadScript = `<script src="${prefix}assets/payload.js"></script>`
  const inlineScriptTag = `<script data-unlighthouse-inline>${inlineScript}</script>`
  if (indexHTML.includes('</head>')) {
    indexHTML = indexHTML.replace('</head>', `${payloadScript}${inlineScriptTag}</head>`)
  }

  // Update asset paths if using a prefix
  if (prefix) {
    indexHTML = indexHTML
      .replace(/(href|src)="\/assets\/(.*?)"/g, `$1="${prefix}assets/$2"`)
      .replace(/(href|src)="\/_nuxt\/(.*?)"/g, `$1="${prefix}_nuxt/$2"`)
      .replace(/(href|src)="\/_fonts\/(.*?)"/g, `$1="${prefix}_fonts/$2"`)
  }

  await fs.writeFile(resolve(runtimeSettings.generatedClientPath, 'index.html'), indexHTML, 'utf-8')

  // Create payload with config and reports
  const staticData: { options: ClientOptionsPayload, scanMeta: ScanMeta, reports: UnlighthouseRouteReport[] } = {
    reports: [],
    scanMeta: createScanMeta(),
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
  if (options.static) {
    staticData.reports = worker.reports().map(r => ({
      ...r,
      artifactPath: '',
    }))
  }

  // Ensure assets directory exists and write payload
  const assetsDir = join(runtimeSettings.generatedClientPath, 'assets')
  await fs.ensureDir(assetsDir)
  await fs.writeFile(
    join(assetsDir, 'payload.js'),
    `window.__unlighthouse_payload = ${JSON.stringify(staticData)}`,
    { encoding: 'utf-8' },
  )

  logger.debug('Client generated successfully')
}
