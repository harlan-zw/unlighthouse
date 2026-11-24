import { join } from 'node:path'
import { defineConfig } from 'tsdown'
import { writeBundledLicenses } from '../../scripts/bundled-licenses.ts'
import { auditArtifactPin } from './src/audit-download-config.ts'
import { installedRuntimePackageVersion, runtimePackageNames } from './src/runtime-package-versions.ts'

const runtimePackages = Object.fromEntries(runtimePackageNames.map(name => [
  name,
  installedRuntimePackageVersion(name),
]))
const auditArtifact = auditArtifactPin()

export default defineConfig({
  hooks: { 'build:done': ({ chunks }) => writeBundledLicenses(chunks, join(import.meta.dirname, 'dist')) },
  define: { __UNLIGHTHOUSE_RUNTIME_PACKAGES__: JSON.stringify(runtimePackages), __UNLIGHTHOUSE_AUDIT_ARTIFACT__: JSON.stringify(auditArtifact) },
  alias: { jiti: join(import.meta.dirname, 'src/config/native-import.ts') },
  entry: ['./src/index.ts', './src/cli/cli.ts', './src/cli/ci.ts', './src/cli/mcp.ts'],
  // These packages locate adjacent runtime assets, or remain optional downloads.
  deps: {
    neverBundle: ['tinypool', 'ws', 'better-opn', 'lighthouse', 'puppeteer-core', '@puppeteer/browsers', '@libsql/client', '@modelcontextprotocol/sdk', '@unlighthouse/ui', '@lhci/utils'],
    alwaysBundle: ['c12', 'cac', 'chrome-launcher', 'citty', 'consola', 'defu', /^drizzle-orm(\/|$)/, 'fflate', 'h3', 'hookable', 'launch-editor', 'listhen', 'ufo', /^unstorage(\/|$)/],
    dts: {
      neverBundle: true,
      alwaysBundle: ['h3', 'hookable', 'consola'],
    },
  },
  format: 'esm',
  dts: true,
  platform: 'node',
})
