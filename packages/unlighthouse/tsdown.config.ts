import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    './src/index.ts',
    './src/cli/cli.ts',
    './src/cli/ci.ts',
    './src/cli/mcp.ts',
  ],
  format: 'esm',
  dts: true,
  platform: 'node',
})
