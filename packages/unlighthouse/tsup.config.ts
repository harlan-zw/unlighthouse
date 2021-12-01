import { defineConfig } from 'tsup'

export default defineConfig({
  entryPoints: [
    'src/providers/cli/index.ts',
    'src/providers/nuxt/module.ts',
  ],

  bundle: true,
  clean: true,
  format: ['cjs', 'esm'],
  dts: true,
  onSuccess: 'npm run build:fix',
})
