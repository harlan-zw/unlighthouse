import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/worker.ts',
  ],
  format: 'esm',
  dts: true,
  platform: 'node',
  deps: {
    neverBundle: [
      'lighthouse',
      'puppeteer-core',
      'chrome-launcher',
      'third-party-web',
      /^@paulirish\//,
    ],
  },
})
