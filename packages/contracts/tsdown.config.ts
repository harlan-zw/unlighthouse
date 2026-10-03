import { join } from 'node:path'
import { defineConfig } from 'tsdown'
import { writeBundledLicenses } from '../../scripts/bundled-licenses.ts'

export default defineConfig({
  hooks: { 'build:done': ({ chunks }) => writeBundledLicenses(chunks, join(import.meta.dirname, 'dist')) },
  entry: [
    './src/index.ts',
    './src/commands/index.ts',
    './src/client/index.ts',
    './src/config/index.ts',
    './src/drizzle/index.ts',
    './src/errors/index.ts',
    './src/hooks/index.ts',
    './src/logging/index.ts',
    './src/packs/index.ts',
    './src/ports/index.ts',
    './src/types/atoms.ts',
  ],
  format: 'esm',
  dts: true,
  platform: 'node',
  deps: {
    alwaysBundle: [/^drizzle-orm(\/|$)/],
    dts: { neverBundle: true },
    neverBundle: [
      'lighthouse',
      'lighthouse/types/lhr/lhr',
      'puppeteer-core',
      'chrome-launcher',
      'listhen',
      'ufo',
      'third-party-web',
      /^@paulirish\//,
    ],
  },
})
