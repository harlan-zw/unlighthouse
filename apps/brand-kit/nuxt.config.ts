import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'pathe'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(here, '../..')

// Path to the canonical design-system layer. This is the layer we're syncing
// from nuxtseo.com/layers/design-system — once the sync lands, the brand-kit
// renders the Unlighthouse design system from this single source.
const designSystem = resolve(repoRoot, 'packages/ui/layers/design-system')

export default defineNuxtConfig({
  // SPA — the brand-kit is a client-only styleguide (mirrors packages/ui's
  // ssr:false). Also sidesteps the @nuxt/icon nitro server route that ENOENTs
  // on `.nuxt/imports` under SSR in this workspace.
  ssr: false,

  // Showcase the design-system layer only. Domain layers (results, scan,
  // audit) are intentionally NOT extended — they pull in server routes and
  // runtime services the showcase doesn't need.
  extends: [
    designSystem,
  ],

  modules: [
    '@nuxt/ui',
    // Required for UiButton's `<m.div>` hover/press FX to animate; the layer
    // also registers it, declared here so the brand-kit is self-contained.
    'motion-v/nuxt',
    // Registers reka-ui primitives (Tooltip*, ToggleGroup*) globally — the
    // design-system components render them by name. Mirrors packages/ui.
    'reka-ui/nuxt',
  ],

  // Clean alias into the design-system layer for the handful of explicit
  // imports (composables, shared motion tokens, component types) that aren't
  // covered by Nuxt's auto-import.
  alias: {
    '#design-system': designSystem,
  },

  // Reuse the design-system global tokens so the brand-kit renders with the
  // canonical palette, fonts, and elevation system.
  css: [resolve(designSystem, 'css/global.css')],

  // `pro` is a custom color used by UiButton/UiChip; declare the full set so
  // Nuxt UI generates its theme classes (mirrors the design-system layer).
  ui: {
    theme: {
      colors: ['primary', 'secondary', 'tertiary', 'info', 'success', 'warning', 'error', 'pro'],
    },
  },

  // Resolve icons from the Iconify API (matching the note below) instead of a
  // local server bundle — @nuxt/icon's default `serverBundle: 'local'` needs
  // `@iconify-json/carbon` + a generated `.nuxt/imports` nitro route, which
  // ENOENTs in this workspace. Wiring-only; the 1:1 showcase code is untouched.
  icon: {
    // Client-only Iconify provider — no @nuxt/icon nitro server route (which
    // ENOENTs on `.nuxt/imports` here). Icons fetch from the Iconify API, as
    // the note below intends. Fits the ssr:false SPA showcase.
    provider: 'iconify',
    serverBundle: false,
  },

  // Carbon icons drive the nav + showcase pages and the layer's icon map.
  // Served from the Iconify API rather than a local bundle so the brand-kit
  // adds no new registry dependency to the workspace (keeps the no-downgrade
  // trust policy happy). Add `@iconify-json/carbon` + `serverBundle: 'local'`
  // later if offline rendering is needed.
  routeRules: {
    '/**': { robots: false, prerender: false },
  },

  devServer: {
    port: 3030,
  },

  devtools: {
    enabled: true,
  },

  // v1 set compatibilityVersion 5 (Nuxt 5 future); this workspace pins Nuxt
  // 4.4.6, where that flag breaks nitro's `#imports` resolution for the
  // @nuxt/icon server route. Use the Nuxt 4 default (matches packages/ui).
  future: {
    compatibilityVersion: 4,
  },

  compatibilityDate: '2026-05-01',
})
