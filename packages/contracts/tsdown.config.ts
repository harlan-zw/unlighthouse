import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/commands/index.ts',
    './src/config/index.ts',
    './src/drizzle/index.ts',
    './src/errors/index.ts',
    './src/hooks/index.ts',
    './src/packs/index.ts',
    './src/ports/index.ts',
    './src/types/atoms.ts',
  ],
  format: 'esm',
  dts: true,
  platform: 'node',
  deps: {
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
