# @unlighthouse/vite

Framework-agnostic Vite plugin for [Unlighthouse](https://unlighthouse.dev).
Drop it into any Vite project and your build output is auto-scanned with
Lighthouse after `vite build` finishes.

> Status: scaffold (v1, Phase 15 of issue #349). Build-time scan is wired
> up; the dev-mode HUD / per-page live scores are a follow-up.

## Install

```bash
pnpm add -D @unlighthouse/vite unlighthouse
```

`unlighthouse` is a peer-runtime dep — your host project provides it so
config, version, and storage match whatever else you run from the CLI.

## Use

```ts
// vite.config.ts
import { defineConfig } from 'vite'
import { unlighthouseVite } from '@unlighthouse/vite'

export default defineConfig({
  plugins: [
    unlighthouseVite({
      // optional — defaults to the Vite preview server URL after build
      site: 'https://staging.example.com',
      // optional — defaults to `<outDir>/unlighthouse-report`
      outputPath: 'dist/unlighthouse-report',
      // optional — block the build until the scan finishes (useful in CI)
      block: false,
    }),
  ],
})
```

Then:

```bash
pnpm vite build
```

After the build closes, the plugin spins up a Vite preview server (unless
`site` is set), runs Unlighthouse against it, and writes the report. The
build process exits as soon as `closeBundle` resolves; by default the
scan runs in the background so CI doesn't wait on it. Set `block: true`
to make the build await the scan.

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `site` | `string` | — | Skip preview server; scan this URL directly. |
| `outputPath` | `string` | `<outDir>/unlighthouse-report` | Where reports land. |
| `block` | `boolean` | `false` | Await the scan in `closeBundle`. |
| `enableOnBuild` | `boolean` | `true` | Set `false` to disable build-time scanning. |
| `unlighthouse` | `object` | `{}` | Extra `UserConfig` forwarded to `createUnlighthouseHost`. |

## Roadmap

- Dev-mode HUD with live per-page Lighthouse scores (separate PR).
- Auto-injected report link in `vite preview`.
