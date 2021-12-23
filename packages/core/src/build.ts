import { dirname, resolve, join } from 'path'
import fs from 'fs-extra'
import { withLeadingSlash, withTrailingSlash } from 'ufo'
import { useUnlighthouse } from './unlighthouse'

/**
 * Copies the file contents of the @unlighthouse/client package and does transformation based on the provided configuration.
 *
 * The main transformation is injecting the unlighthouse configuration into the head of the document, making it accessible
 * to the client.
 *
 * An additional transforming is needed to modify the vite base URL which is a bit more involved.
 */
export const generateClient = async() => {
  const { runtimeSettings, resolvedConfig } = useUnlighthouse()

  const headScript = `
window.__unlighthouse_options = ${JSON.stringify({ ...runtimeSettings, ...resolvedConfig })}
`
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
