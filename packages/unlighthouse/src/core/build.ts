import { dirname, resolve } from 'path'
import fs from 'fs-extra'
import { Options } from '@shared'

export const generateBuild = async(options: Options) => {
  const headScript = `
window.__unlighthouse_options = ${JSON.stringify(options)}
`

  await fs.copy(dirname(options.resolvedClient), options.clientPath)
  let indexHTML = await fs.readFile(options.resolvedClient, 'utf-8')
  indexHTML = indexHTML.replace('<head>', `<head><script>${headScript}</script>`)
  await fs.writeFile(resolve(options.clientPath, 'index.html'), indexHTML, 'utf-8')

  return options.clientPath
}
