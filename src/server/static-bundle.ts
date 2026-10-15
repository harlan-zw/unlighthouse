import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const UI_DIR = fileURLToPath(new URL('../ui/', import.meta.url))

export interface StaticBundle {
  html: string
  js: string
  css: string
}

export async function staticBundle(): Promise<StaticBundle> {
  const result = await Bun.build({
    entrypoints: [join(UI_DIR, 'static-main.tsx'), join(UI_DIR, 'styles.css')],
    target: 'browser',
    format: 'iife',
    minify: true,
    define: { 'process.env.NODE_ENV': '"production"' },
  })
  if (!result.success)
    throw new Error(`The dashboard bundle failed: ${result.logs.map(log => log.message).join('; ')}`)
  const js = result.outputs.find(output => output.kind === 'entry-point' && output.path.endsWith('.js'))
  const css = result.outputs.find(output => output.path.endsWith('.css'))
  if (!js || !css)
    throw new Error('The dashboard bundle is missing its script or stylesheet')
  return { html: readFileSync(join(UI_DIR, 'index.html'), 'utf8'), js: await js.text(), css: await css.text() }
}
