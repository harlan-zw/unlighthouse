# @unlighthouse/nuxt

Nuxt module for [Unlighthouse](https://unlighthouse.dev). Drop it into a
Nuxt app and your statically generated output is auto-scanned with
Lighthouse after `nuxi generate` finishes.

> Status: scaffold (v1, Phase 15 of issue #349). Post-generate scan is
> wired up; the dev-mode HUD with live per-page scores is a follow-up.

## Install

```bash
pnpm add -D @unlighthouse/nuxt unlighthouse
```

`unlighthouse` is a peer-runtime dep — your host project provides it so
config, version, and storage match whatever else you run from the CLI.

## Use

```ts
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@unlighthouse/nuxt'],
  unlighthouse: {
    // optional — defaults to a preview server URL serving the generated output
    site: 'https://staging.example.com',
    // optional — defaults to `<rootDir>/.output/unlighthouse-report`
    outputPath: '.output/unlighthouse-report',
    // optional — block `nuxi generate` until the scan finishes (useful in CI)
    block: false,
  },
})
```

Then:

```bash
pnpm nuxi generate
```

After the generate step closes, the module spins up a static preview
server (unless `site` is set), runs Unlighthouse against it, and writes
the report. The command exits as soon as `generate:done` resolves; by
default the scan runs in the background so CI doesn't wait on it. Set
`block: true` to make the build await the scan.

Set `UNLIGHTHOUSE_SKIP=true` in the environment to skip the scan entirely
without removing the module (useful for fast iterative builds).

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `site` | `string` | — | Skip preview server; scan this URL directly. |
| `outputPath` | `string` | `<rootDir>/.output/unlighthouse-report` | Where reports land. |
| `block` | `boolean` | `false` | Await the scan in `generate:done`. |
| `enableOnGenerate` | `boolean` | `true` | Set `false` to disable post-generate scanning. |
| `unlighthouse` | `object` | `{}` | Extra `UserConfig` forwarded to `createUnlighthouseHost`. |

## Roadmap

- Dev-mode HUD with live per-page Lighthouse scores (separate PR).
- Auto-detected route list from the Nuxt router fed straight into the
  scan's manual seeds.
