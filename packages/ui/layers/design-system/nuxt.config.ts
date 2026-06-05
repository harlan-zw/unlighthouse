import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineNuxtConfig } from 'nuxt/config'

const currentDir = dirname(fileURLToPath(import.meta.url))

// Design system layer: design language extended by the dashboard — UI primitives, tokens, fonts,
// motion, chart helpers, formatters, design vocabularies (Status, severity), cross-cutting UI
// affordances. Synced from the canonical nuxtseo.com design-system; the docs-only modules
// (@nuxt/content, @nuxt/image, @nuxt/scripts, mdc) are dropped — the dashboard SPA doesn't use them.
//
// Components MUST NOT be prefixed Pro/Admin/Tool — the layer name is the scope.
// Internal taxonomy: app/components/{container,data,element}/.

export default defineNuxtConfig({
  // Modules are registered by the consuming app (packages/ui nuxt.config) — in this
  // monorepo the layer dir has no node_modules, so module-string resolution must
  // happen from the app root. The layer only contributes css/components/theme config.

  css: [
    join(currentDir, './css/global.css'),
  ],

  components: [
    {
      path: join(currentDir, './app/components'),
      pathPrefix: false,
      // Higher priority so design-system primitives win shadow conflicts against
      // the consuming app's own app/components/* of the same basename.
      priority: 10,
    },
  ],

  fonts: {
    families: [
      // Variable wght axis as a RANGE (not discrete cuts) so the --wght-* tokens
      // (430/540/620/680) interpolate instead of snapping to 100-step statics.
      // Capped 400–700: ExtraLight (200–300) reads broken at body sizes. Width is
      // likewise a range so the --wdth-* axis interpolates.
      { name: 'Hubot Sans', weights: ['400 700'], stretch: '75% 125%', global: true },
      { name: 'Fira Code', weights: [400, 500], global: true },
    ],
  },

  ui: {
    experimental: { componentDetection: true },
    theme: {
      colors: ['primary', 'secondary', 'tertiary', 'info', 'success', 'warning', 'error', 'pro'],
    },
  },
})
