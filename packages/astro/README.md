# @unlighthouse/astro

Astro integration for [Unlighthouse](https://unlighthouse.dev). Drop it
into your `astro.config.mjs` and your built site is auto-scanned with
Lighthouse after `astro build` finishes.

> Status: scaffold (v1, Phase 15 of issue #349). Build-time scan against
> the build output is wired up. Content-collection-aware seed extraction
> is deferred to a follow-up — the first iteration uses the `routes`
> array Astro hands to `astro:build:done`.

## Install

```bash
pnpm add -D @unlighthouse/astro unlighthouse
```

`unlighthouse` is a peer-runtime dep — your host project provides it so
config, version, and storage match whatever else you run from the CLI.

## Use

```ts
// astro.config.mjs
import { defineConfig } from 'astro/config'
import { unlighthouseAstro } from '@unlighthouse/astro'

export default defineConfig({
  integrations: [
    unlighthouseAstro({
      // optional — defaults to a temporary preview server against `dir`
      site: 'https://staging.example.com',
      // optional — defaults to `<dist>/unlighthouse-report`
      outputPath: 'dist/unlighthouse-report',
      // optional — block the build until the scan finishes (useful in CI)
      block: false,
    }),
  ],
})
```

Then:

```bash
pnpm astro build
```

After `astro:build:done` fires, the integration spins up a tiny preview
HTTP server against the build output (unless `site` is set), seeds
Unlighthouse with the routes Astro emitted, runs the scan, and tears the
preview down. By default the scan runs in the background so CI doesn't
wait on it; set `block: true` to await it.

Skip the integration without removing it from your config by setting
`UNLIGHTHOUSE_SKIP=true` in the environment.

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `site` | `string` | — | Skip preview server; scan this URL directly. |
| `outputPath` | `string` | `<dist>/unlighthouse-report` | Where reports land. |
| `block` | `boolean` | `false` | Await the scan in `astro:build:done`. |
| `enableOnBuild` | `boolean` | `true` | Set `false` to disable build-time scanning. |
| `unlighthouse` | `object` | `{}` | Extra `UserConfig` forwarded to `createUnlighthouseHost`. |

## Roadmap

- Content-collection seed extraction (read `astro:content` collections at
  build time and feed entry slugs into the scan queue as additional URLs
  beyond what `routes` hands us).
- Dev-mode HUD with live per-page Lighthouse scores (separate PR).
