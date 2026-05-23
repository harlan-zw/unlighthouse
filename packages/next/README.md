# @unlighthouse/next

[Next.js](https://nextjs.org) integration for [Unlighthouse](https://unlighthouse.dev).
Wrap your `next.config.js` and your production builds get auto-scanned
with Lighthouse.

> Status: scaffold (v1, Phase 15 of issue #349). Build-time scan is wired
> up; preview-deploy middleware + PR-comment diff posting are follow-ups.

## Install

```bash
pnpm add -D @unlighthouse/next unlighthouse
```

`unlighthouse` is a peer-runtime dep — your host project provides it so
config, version, and storage match whatever else you run from the CLI.

## Use — HOC

```js
// next.config.js
const { withUnlighthouse } = require('@unlighthouse/next')

module.exports = withUnlighthouse(
  {
    reactStrictMode: true,
    // ...your existing Next config
  },
  {
    // optional — defaults to $UNLIGHTHOUSE_SITE or http://localhost:3000
    site: 'http://localhost:3000',
    // optional — defaults to Unlighthouse's own default
    outputPath: '.unlighthouse-report',
  },
)
```

```bash
NODE_ENV=production pnpm next build
# ↑ when the client compiler finishes, the scan kicks off in the background
```

The HOC attaches a `webpack.compiler.hooks.done.tap()` hook on the client
compiler only. It dedupes repeated `done` events from the same build and
only fires under `NODE_ENV=production`.

Set `UNLIGHTHOUSE_SKIP=true` in your env to disable the hook entirely
for a specific CI matrix without editing config.

## Use — CLI

If you'd rather not touch `next.config.js`, drop the bin into your
pipeline:

```bash
pnpm next build
pnpm next start &
NEXT_PID=$!
pnpm dlx unlighthouse-next --site http://localhost:3000
kill $NEXT_PID
```

## Options

| Option | Type | Default | Notes |
|--------|------|---------|-------|
| `site` | `string` | `$UNLIGHTHOUSE_SITE` or `http://localhost:3000` | URL to crawl. |
| `outputPath` | `string` | Unlighthouse default | Where reports land. |
| `enableOnBuild` | `boolean` | `true` | Set `false` to disable the webpack hook. |
| `unlighthouse` | `object` | `{}` | Extra `UserConfig` forwarded to `createUnlighthouseHost`. |

## Roadmap

- Middleware that scans on preview deploys (Vercel / Netlify hooks).
- PR-comment diff posting via GitHub API.
- Dev-mode HUD with live per-page Lighthouse scores.
