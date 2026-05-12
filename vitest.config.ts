import type { AliasOptions } from 'vite'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'

const r = (p: string) => resolve(__dirname, p)

export const alias: AliasOptions = {
  'unlighthouse': r('./packages/unlighthouse/src/'),
  '@unlighthouse/ui': r('./packages/ui/'),
  '@unlighthouse/contracts': r('./packages/contracts/src/index.ts'),
  '@unlighthouse/core': r('./packages/core/src/'),
}

export default defineConfig({
  test: {
    testTimeout: 3000000,
  },
  resolve: {
    alias,
  },
})
