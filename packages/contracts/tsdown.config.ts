import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/drizzle/index.ts',
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
