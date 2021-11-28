import { dirname, resolve } from 'path'
import fs from 'fs-extra'
import { useUnlighthouseEngine } from './engine'

/**
 * Copies the file contents of the unlighthouse-client package and injects js into the head of index.html for the
 * runtime options of the engine.
 */
export const generateClient = async() => {
  const { runtimeSettings, resolvedConfig } = useUnlighthouseEngine()

  const headScript = `
window.__unlighthouse_options = ${JSON.stringify({ ...runtimeSettings, ...resolvedConfig })}
`
  await fs.copy(dirname(runtimeSettings.resolvedClientPath), runtimeSettings.generatedClientPath)
  let indexHTML = await fs.readFile(runtimeSettings.resolvedClientPath, 'utf-8')
  indexHTML = indexHTML.replace(/<script data-unlighthouse>.*?<\/script>/gms, `<script>${headScript}</script>`)
  await fs.writeFile(resolve(runtimeSettings.generatedClientPath, 'index.html'), indexHTML, 'utf-8')
}
