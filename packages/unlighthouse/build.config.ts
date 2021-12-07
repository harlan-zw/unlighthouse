import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig({
  declaration: true,
  clean: true,
  entries: [
    { input: 'src/index' },
    { input: 'src/cli' },
    { input: 'src/ci' },
    { input: 'src/vite' },
    { input: 'src/webpack' },
    { input: 'src/rollup' },
    { input: 'src/core/defineConfig', name: 'config' },
    { input: 'src/core/unlighthouse', name: 'index' },
    { input: 'src/frameworks/nuxt', name: 'nuxt' },
    { input: 'src/frameworks/vitepress', name: 'vitepress' },
    { input: 'src/frameworks/next', name: 'next' },
    { input: '../unlighthouse-utils/index.d.ts', name: 'types' },
    { input: 'src/process/lighthouse', outDir: 'dist/process/lighthouse.ts', builder: 'mkdist', declaration: false },
  ],
  externals: [
    'unrouted',
    'node:net',
    'vite',
    'rollup',
    'webpack',
    '@nuxt/schema',
  ],
})
