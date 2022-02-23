import { dirname, join, resolve } from 'path'
import fs from 'fs-extra'
import { withLeadingSlash, withTrailingSlash } from 'ufo'
import { useLogger, useUnlighthouse } from './unlighthouse'
import type { GenerateClientOptions, ResolvedUserConfig, RuntimeSettings, ScanMeta, UnlighthouseContext, UnlighthouseRouteReport } from './types'
import { createScanMeta } from './data'

/**
 * Copies the file contents of the @unlighthouse/client package and does transformation based on the provided configuration.
 *
 * The main transformation is injecting the unlighthouse configuration into the head of the document, making it accessible
 * to the client.
 *
 * An additional transforming is needed to modify the vite base URL which is a bit more involved.
 */
export const generateClient = async(options: GenerateClientOptions = {}, unlighthouse?: UnlighthouseContext) => {
  const logger = useLogger()
  if (!unlighthouse)
    unlighthouse = useUnlighthouse()

  const { runtimeSettings, resolvedConfig, worker } = unlighthouse

  const prefix = withTrailingSlash(withLeadingSlash(resolvedConfig.routerPrefix))
  const clientPathFolder = dirname(runtimeSettings.resolvedClientPath)

  await fs.copy(clientPathFolder, runtimeSettings.generatedClientPath)
  // update the html with our config and base url if needed
  const inlineScript = `window.__unlighthouse_static = ${options.static}`
  let indexHTML = await fs.readFile(runtimeSettings.resolvedClientPath, 'utf-8')
  indexHTML = indexHTML
    .replace(/<script data-unlighthouse-inline>.*?<\/script>/gms, `<script data-unlighthouse-inline>${inlineScript}</script>`)
    .replace(/(href|src)="\/assets\/(.*?)"/gm, `$1="${prefix}assets/$2"`)
  await fs.writeFile(resolve(runtimeSettings.generatedClientPath, 'index.html'), indexHTML, 'utf-8')

  const staticData: { options: ResolvedUserConfig & RuntimeSettings; scanMeta: ScanMeta; reports: UnlighthouseRouteReport[] } = {
    reports: [],
    scanMeta: createScanMeta(),
    options: { ...runtimeSettings, ...resolvedConfig },
  }
  if (options.static)
    staticData.reports = worker.reports()

  await fs.writeFile(
    join(runtimeSettings.generatedClientPath, 'assets', 'payload.js'),
    `window.__unlighthouse_payload = ${JSON.stringify(staticData)}`,
    { encoding: 'utf-8' },
  )

  // update the baseurl within the modules
  const globby = (await import('globby'))
  const clientAssetsPath = join(dirname(runtimeSettings.resolvedClientPath), 'assets')
  const indexFile = (await globby.globby(['index.*.js'], { cwd: clientAssetsPath }))?.[0]
  if (indexFile) {
    const indexPath = join(clientAssetsPath, indexFile)
    // should be a single entry
    let indexJS = await fs.readFile(indexPath, 'utf-8')
    indexJS = indexJS
      .replace('const base = "/";', `const base = "${prefix}";`)
      .replace('createWebHistory("/")', `createWebHistory("${prefix}")`)
    await fs.writeFile(indexPath.replace(clientPathFolder, runtimeSettings.generatedClientPath), indexJS, 'utf-8')
  }
  else {
    logger.warn(`Failed to find index.[hash].js file from wd ${clientAssetsPath}.`)
  }
}
