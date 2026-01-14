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
 * Copies the file contents of the @unlighthouse/client package and does transformation based on the provided configuration.
 *
 * The main transformation is injecting the unlighthouse configuration into the head of the document, making it accessible
 * to the client.
 *
 * An additional transforming is needed to modify the vite base URL which is a bit more involved.
 */
export async function generateClient(options: GenerateClientOptions = {}, unlighthouse?: UnlighthouseContext) {
  const logger = useLogger()
  if (!unlighthouse)
    unlighthouse = useUnlighthouse()

  const { runtimeSettings, resolvedConfig, worker } = unlighthouse

  let prefix = withTrailingSlash(withLeadingSlash(resolvedConfig.routerPrefix))
  // for non-specified paths we use relative
  if (prefix === '/') {
    prefix = ''
  }
  const clientPathFolder = dirname(runtimeSettings.resolvedClientPath)

  await fs.copy(clientPathFolder, runtimeSettings.generatedClientPath)
  // update the html with our config and base url if needed
  const inlineScript = `window.__unlighthouse_static = ${!!options.static}`
  let indexHTML = await fs.readFile(runtimeSettings.resolvedClientPath, 'utf-8')

  // More robust replacement that handles multiline script content
  indexHTML = indexHTML
    .replace(/<script data-unlighthouse-inline>[\s\S]*?<\/script>/g, `<script data-unlighthouse-inline>
  ${inlineScript}
  // boilerplate options to run the client by itself
  </script>`)
    .replace(/(href|src)="\/assets\/(.*?)"/g, `$1="${prefix}assets/$2"`)
  await fs.writeFile(resolve(runtimeSettings.generatedClientPath, 'index.html'), indexHTML, 'utf-8')

  const staticData: { options: ClientOptionsPayload, scanMeta: ScanMeta, reports: UnlighthouseRouteReport[] } = {
    reports: [],
    scanMeta: createScanMeta(),
    // need to be selective about what options we put here to avoid exposing anything sensitive
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
  // avoid exposing sensitive cookie / header options
  staticData.options.lighthouseOptions = { onlyCategories: resolvedConfig.lighthouseOptions.onlyCategories }
  if (options.static) {
    staticData.reports = worker.reports().map((r) => {
      return {
        ...r,
        // avoid exposing user paths
        artifactPath: '',
      }
    })
  }

  await fs.writeFile(
    join(runtimeSettings.generatedClientPath, 'assets', 'payload.js'),
    `window.__unlighthouse_payload = ${JSON.stringify(staticData)}`,
    { encoding: 'utf-8' },
  )

  // update the baseurl within the modules
  const globby = (await import('globby'))
  const clientAssetsPath = join(dirname(runtimeSettings.resolvedClientPath), 'assets')
  logger.debug(`Looking for index.*.js files in: ${clientAssetsPath}`)

  const indexFiles = await globby.globby(['index*.js', 'index-*.js'], { cwd: clientAssetsPath })
  logger.debug(`Found index files:`, indexFiles)

  const indexFile = indexFiles?.[0]
  if (indexFile) {
    const indexPath = join(clientAssetsPath, indexFile)
    const outputPath = join(runtimeSettings.generatedClientPath, 'assets', indexFile)
    logger.debug(`Processing index file: ${indexPath} -> ${outputPath}`)

    // should be a single entry
    let indexJS = await fs.readFile(indexPath, 'utf-8')
    indexJS = indexJS
      .replace('const base = "/";', `const base = window.location.pathname;`)
      .replace('createWebHistory("/")', `createWebHistory(window.location.pathname)`)
    await fs.writeFile(outputPath, indexJS, 'utf-8')
  }
  else {
    logger.warn(`Failed to find index.[hash].js file from wd ${clientAssetsPath}.`)
    logger.debug(`Searched patterns: ['index*.js', 'index-*.js']`)
  }
}
