import { fileURLToPath } from 'node:url'
import antfu, { pnpm } from '@antfu/eslint-config'
import harlanzw from 'eslint-plugin-harlanzw'
import typegen from 'eslint-typegen'

const pnpmCatalogConflictConfig = (await pnpm({ json: false, sort: false }))
  .map(config => config.name === 'antfu/pnpm/pnpm-workspace-yaml'
    ? {
        ...config,
        name: 'unlighthouse/pnpm/catalog-conflicts',
        rules: {
          ...config.rules,
          'pnpm/yaml-no-duplicate-catalog-item': ['error', { allow: ['vite'] }],
        },
      }
    : config)

// Raw Nuxt UI primitives that have a design-system wrapper in
// packages/ui/layers/design-system. Consumers MUST use the wrapper so theming,
// tokens, and a11y defaults stay centralized. The design-system layer itself is
// exempt — its wrappers are the only place the raw primitive may be used.
// UTabs is intentionally absent: there is no UiTabs wrapper yet, so the raw
// component is allowed.
const dsWrappedComponents = {
  UButton: 'UiButton',
  UTooltip: 'UiTooltip',
  UPopover: 'UiPopover',
  UTable: 'UiTable',
  UAlert: 'UiAlert',
  UCard: 'UiCard',
  USkeleton: 'UiSkeleton',
  UChip: 'UiChip',
}

const dsComponentBanSelectors = Object.entries(dsWrappedComponents).map(([from, to]) => ({
  selector: `VElement[rawName='${from}']`,
  message: `Use <${to}> (layers/design-system) instead of <${from}> — the wrapper centralizes theming, tokens, and a11y defaults.`,
}))

export default typegen(antfu({
  vue: true,
  rules: {
    'e18e/prefer-array-to-sorted': 'off',
    'e18e/prefer-static-regex': 'off',
    'no-use-before-define': 'off',
    'no-restricted-globals': 'off',
    'node/prefer-global/buffer': 'off',
    'node/prefer-global/process': 'off',
    'regexp/no-unused-capturing-group': 'off',
    'style/max-statements-per-line': 'off',
    'ts/no-use-before-define': 'off',
    'ts/prefer-ts-expect-error': 'off',
    'unused-imports/no-unused-vars': ['error', {
      args: 'after-used',
      argsIgnorePattern: '^_',
      caughtErrors: 'all',
      caughtErrorsIgnorePattern: '^_',
      vars: 'all',
      varsIgnorePattern: '^_',
    }],
  },
  ignores: [
    '.codex/**',
    '.data/**',
    'scripts/**',
    'test/*',
    'examples/*',
    'examples/**/*.*',
    'CLAUDE.md',
    '**/*.md',
  ],
}, ...harlanzw({
  link: {
    ignoreExternal: true,
    requireTrailingSlash: false,
  },
  nuxt: true,
  vue: true,
  content: false,
  prompt: false,
  pnpm: true,
}), {
  name: 'unlighthouse/harlanzw-overrides',
  plugins: {
    harlanzw: harlanzw.plugin,
  },
  rules: {
    'harlanzw/nuxt-no-redundant-import-meta': 'warn',
    'harlanzw/nuxt-prefer-navigate-to-over-router-push-replace': 'off',
    'harlanzw/vue-no-faux-composables': 'warn',
    'harlanzw/vue-no-resolve-component-in-composables': 'warn',
  },
}, ...pnpmCatalogConflictConfig, {
  // Dashboard app: enforce the DS wrappers over raw Nuxt UI primitives. The
  // design-system layer is exempt (its wrappers wrap the raw primitive).
  name: 'unlighthouse/ds-component-bans',
  files: ['packages/ui/**/*.vue'],
  ignores: ['packages/ui/layers/design-system/**'],
  rules: {
    'vue/no-restricted-syntax': ['error', ...dsComponentBanSelectors],
  },
}, {
  // D-032: the UI's live path imports the typed client from
  // @unlighthouse/contracts/client and nothing from core. The only permitted
  // core import is the static (offline) read slice, which is deliberately
  // browser-portable (test/e2e/treeshake.test.ts `browser-static`). Everything
  // else in core drags node:*/db/server deps into the ssr:false bundle.
  name: 'unlighthouse/ui-core-import-boundary',
  files: ['packages/ui/**/*.{ts,vue}'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        // Any @unlighthouse/core specifier EXCEPT the browser-portable
        // api/static-client read slice.
        regex: '^@unlighthouse/core(?!/api/static-client$)',
        message: 'The UI may only import @unlighthouse/core via api/static-client (D-032). Use @unlighthouse/contracts/* for everything else.',
      }],
    }],
  },
}), {
  dtsPath: fileURLToPath(new URL('eslint-typegen.d.ts', import.meta.url)),
})
