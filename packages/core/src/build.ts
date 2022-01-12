import { dirname, join, resolve } from 'path'
import fs from 'fs-extra'
import { withLeadingSlash, withTrailingSlash } from 'ufo'
import { useUnlighthouse } from './unlighthouse'
import type { GenerateClientOptions, UnlighthouseContext } from './types'
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
  if (!unlighthouse)
    unlighthouse = useUnlighthouse()

  const { runtimeSettings, resolvedConfig, worker } = unlighthouse

  let headScript = `
window.__unlighthouse_options = ${JSON.stringify({ ...runtimeSettings, ...resolvedConfig })}
`
  // in static mode we need to provide all of the reports and stats to the client
  if (options.static) {
    const staticData = {
      scanMeta: createScanMeta(),
      reports: worker.reports(),
    }
    headScript += `window.__unlighthouse_static = true
window.__unlighthouse_data = ${JSON.stringify(staticData)}`
  }
  const prefix = withTrailingSlash(withLeadingSlash(resolvedConfig.router.prefix))
  const clientPathFolder = dirname(runtimeSettings.resolvedClientPath)
  await fs.copy(clientPathFolder, runtimeSettings.generatedClientPath)
  // update the html with our config and base url if needed
  let indexHTML = await fs.readFile(runtimeSettings.resolvedClientPath, 'utf-8')
  indexHTML = indexHTML
    .replace(/<script data-unlighthouse>.*?<\/script>/gms, `<script>${headScript}</script>`)
    .replace(/(href|src)="\/assets\/(.*?)"/gm, `$1="${prefix}assets/$2"`)
  await fs.writeFile(resolve(runtimeSettings.generatedClientPath, 'index.html'), indexHTML, 'utf-8')
  // update the baseurl within the modules
  const globby = (await import('globby'))
  const indexJSGlobby = await globby.globby(join(dirname(runtimeSettings.resolvedClientPath), 'assets', 'index.*.js'))
  // should be a single entry
  let indexJS = await fs.readFile(indexJSGlobby[0], 'utf-8')
  indexJS = indexJS
    .replace('const base = "/";', `const base = "${prefix}";`)
    .replace('createWebHistory("/")', `createWebHistory("${prefix}")`)
  await fs.writeFile(indexJSGlobby[0].replace(clientPathFolder, runtimeSettings.generatedClientPath), indexJS, 'utf-8')
}
