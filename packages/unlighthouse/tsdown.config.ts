import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { defineConfig } from 'tsdown'
import { writeBundledLicenses } from '../../scripts/bundled-licenses.ts'

const require = createRequire(import.meta.url)
function installedVersion(name: string): string {
  const entry = name === '@modelcontextprotocol/sdk' ? `${name}/server/index.js` : name === '@lhci/utils' ? `${name}/src/api-client.js` : name
  let directory = dirname(require.resolve(entry))
  while (true) {
    const manifest = join(directory, 'package.json')
    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8'))
      if (parsed.name === name && parsed.version)
        return parsed.version
    }
    const parent = dirname(directory)
    if (parent === directory)
      throw new Error(`Cannot resolve runtime version: ${name}`)
    directory = parent
  }
}
const runtimePackages = Object.fromEntries(['lighthouse', 'puppeteer-core', '@puppeteer/browsers', '@libsql/client', '@modelcontextprotocol/sdk', '@unlighthouse/ui', 'unstorage', 'aws4fetch', 'jiti', '@lhci/utils'].map(name => [name, installedVersion(name)]))

export default defineConfig({
  hooks: { 'build:done': ({ chunks }) => writeBundledLicenses(chunks, join(import.meta.dirname, 'dist')) },
  define: { __UNLIGHTHOUSE_RUNTIME_PACKAGES__: JSON.stringify(runtimePackages) },
  alias: { jiti: join(import.meta.dirname, 'src/config/native-import.ts') },
  entry: ['./src/index.ts', './src/cli/cli.ts', './src/cli/ci.ts', './src/cli/mcp.ts'],
  // These packages locate adjacent runtime assets, or remain optional downloads.
  deps: {
    neverBundle: ['tinypool', 'ws', 'better-opn', 'lighthouse', 'puppeteer-core', '@puppeteer/browsers', '@libsql/client', '@modelcontextprotocol/sdk', '@unlighthouse/ui', '@lhci/utils'],
    alwaysBundle: ['c12', 'cac', 'chrome-launcher', 'citty', 'consola', 'defu', /^drizzle-orm(\/|$)/, 'h3', 'hookable', 'launch-editor', 'listhen', 'ufo', /^unstorage(\/|$)/],
    dts: {
      neverBundle: true,
      alwaysBundle: ['h3', 'hookable', 'consola'],
    },
  },
  format: 'esm',
  dts: true,
  platform: 'node',
})
