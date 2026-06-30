import antfu from '@antfu/eslint-config'

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

export default antfu({
  rules: {
    'no-use-before-define': 'off',
    'node/prefer-global/process': 'off',
    'ts/no-use-before-define': 'off',
    'ts/prefer-ts-expect-error': 'off',
  },
  ignores: [
    'test/*',
    'examples/*',
    'examples/**/*.*',
    '**/*.md',
  ],
}, {
  // Dashboard app: enforce the DS wrappers over raw Nuxt UI primitives. The
  // design-system layer is exempt (its wrappers wrap the raw primitive).
  name: 'unlighthouse/ds-component-bans',
  files: ['packages/ui/**/*.vue'],
  ignores: ['packages/ui/layers/design-system/**'],
  rules: {
    'vue/no-restricted-syntax': ['error', ...dsComponentBanSelectors],
  },
})
