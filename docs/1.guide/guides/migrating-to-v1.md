---
title: "Migrating to v1"
description: "Move CLI scripts and programmatic integrations from Unlighthouse 0.19 to the v1 beta."
navigation:
  title: "Migrating to v1"
---

This guide compares the 0.19.1 `main` branch with the v1 beta.
The beta replaces the programmatic runtime and storage model.
Review custom integrations before upgrading.

## Runtime and packages

Use Node.js 24.13.1 or newer.
The previous minimum was Node.js 22.18.0.

Install the beta through the `beta` npm tag:

```sh
npm install --save-dev unlighthouse@beta
```

The `unlighthouse` package contains the CLI, CI runner, server, and MCP executable.
Audit engines and dashboard assets download on first use, then remain in a shared cache.
Keep npm and network access available for those initial downloads.
Set `UNLIGHTHOUSE_RUNTIME_CACHE` to choose the dependency cache directory.
Replace direct dependencies on `@unlighthouse/cli`, `@unlighthouse/server`, and `@unlighthouse/client` with `unlighthouse`.
Replace standalone `unlighthouse-ci` package installations too.
The `unlighthouse` and `unlighthouse-ci` executable names remain available.

The v1 `@unlighthouse/core` package exposes adapters and the new core factory.
Its exports differ from the previous core package.
Use the host factory for ordinary Node.js integrations.

Nuxt, Vite, and Webpack integration packages were already removed from `main` before this comparison.
Their removal is not an additional v1 change.

## CLI scripts

Most documented scan flags retain their meaning.
Config-only invocations still start a scan when the config supplies a site.
Use `--history` to open the dashboard without starting a scan.

```sh
unlighthouse --config-file unlighthouse.config.ts
unlighthouse --site https://example.com --device mobile,desktop
unlighthouse --history
unlighthouse-ci --site https://example.com --reporter csvExpanded
```

Explicit boolean flags override config values, including `--cache=false` and `--debug=false`.
Prefer documented kebab flags, such as `--extra-headers`.
Undocumented camelCase aliases, such as `--extraHeaders`, are not supported by the root CLI.

CI now follows the configured cache setting.
The previous CI runner forced cache off.
Use `--no-cache` when you need to reset the output directory.

```sh
unlighthouse-ci --site https://example.com --no-cache --reporter json
```

`--reporter false` disables the CI export.
An explicit reporter flag overrides `ci.reporter`, including a configured `false` value.
Budget checks still run when reporting is disabled.
Budget values remain percentages from 1 to 100.

## Config helpers

Replace `defineConfig` with `defineUnlighthouseConfig` from `unlighthouse/config`.
The helper provides types and returns the supplied config.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  scanner: { samples: 3 },
})
```

Existing `site`, `urls`, `lighthouseOptions`, `extraHeaders`, and `auth` options remain available.
Some accepted scanner and authentication options have narrower effects.

### URL discovery limits

The v1 crawler fetches server-rendered HTML with native fetch.
`--enable-javascript` does not enable browser-based link discovery.
Use a sitemap or explicit `urls` for links rendered by JavaScript.

`scanner.crawler: false` stops following links and audits only seed URLs.
Dynamic route sampling and `scanner.customSampling` do not control the v1 scan pipeline.
Use explicit `urls` to select representative routes, and `scanner.maxRoutes` to bound the scan.
`scanner.samples` still controls repeated audits for each route.

The v1 pipeline does not apply legacy robots.txt discovery and exclusion rules.
Supply sitemap URLs explicitly with `scanner.sitemap`.
Use `scanner.exclude` for paths you must exclude.
Review crawl policy before scanning a production site.

The `cookies` option applies to fetch helpers, but does not seed the local Lighthouse browser.
For cookie headers, use `extraHeaders.Cookie`.
The HTML discovery crawler receives configured headers and cookies for the site's origin.
Cross-origin redirects do not receive those credentials.

### Route definitions

Replace filesystem discovery options with `routeDefinitions`.
Choose the framework explicitly.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  routeDefinitions: {
    framework: 'nuxt',
    pagesDir: 'pages',
    extensions: ['vue', 'md'],
  },
})
```

Use `framework: 'next'` for Next.js route definitions.
Legacy `discovery.pagesDir` and `discovery.supportedExtensions` do not configure the v1 filesystem seed source.

### Browser customization

The local auditor uses Lighthouse with Chrome Launcher.
It does not use the previous Puppeteer cluster.
`puppeteerClusterOptions` has no replacement.
`puppeteerOptions` does not configure the local auditor, even though the config parser accepts it.

Use `CHROME_FLAGS` for Chrome process arguments.
Use `lighthouseOptions` for supported Lighthouse audit settings.
Use `scanner.perfConcurrency` to select serial or parallel performance audits.
Set `CHROME_PATH` to select an installed Chrome browser.
The `chrome` options control system-browser selection and automatic download fallback.
See [Chrome Dependency](/guide/guides/chrome-dependency) for supported options.

## Standalone adapters and MCP

Replace `crawleeCrawler` with `htmlCrawler` from `@unlighthouse/core/crawlers`.
Crawlee-specific adapter hooks have no replacement.
The HTML crawler supports cancellation, but does not expose pause or resume methods.

Standalone Core hosts must install dependencies required by their chosen adapters.
For the local Lighthouse auditor, install `lighthouse` and `puppeteer-core`.
The `unlighthouse` host downloads these dependencies automatically.

Standalone MCP hosts must install `@modelcontextprotocol/sdk`.
The root `unlighthouse-mcp` executable downloads its SDK automatically.
`createMcpServer(options)` now returns a promise.
Await it before connecting a transport:

```ts
import type { CreateMcpServerOptions } from '@unlighthouse/mcp'
import { createMcpServer } from '@unlighthouse/mcp'

export async function createServer(options: CreateMcpServerOptions) {
  return await createMcpServer(options)
}
```

## Programmatic scans

Replace `createUnlighthouse(userConfig, provider)` with `createUnlighthouseHost({ userConfig, behavior })`.
Keep the returned host and pass it to your integration code.
The global `useUnlighthouse()` and `useLogger()` accessors are removed.

```ts
import { createUnlighthouseHost } from 'unlighthouse'

const host = await createUnlighthouseHost({
  userConfig: {
    site: 'https://example.com',
    urls: ['/', '/about'],
  },
  behavior: { ws: null },
})

host.hooks.hook('scan:complete', ({ scanId, summary }) => {
  console.log(scanId, summary.completed)
})

const session = await host.start()
const result = await session.done
console.log(result.scanId, result.summary)

await host.generateClient({ static: true })
```

`start()` returns a session after starting the scan.
Await `session.done` for completion and failures.
Use `session.stats()` and `session.state()` for progress.
Use `session.cancel()` to cancel a scan.
Pause and resume depend on `session.capabilities.pausable`.

| Previous API | v1 migration |
| --- | --- |
| Provider `urls` | Set `userConfig.urls`. |
| Provider filesystem options | Set `userConfig.routeDefinitions`. |
| Provider custom router | No automatic replacement. Use explicit URLs or a custom seed source. |
| `generateClient(options, context)` | Call `host.generateClient({ static: true })`. |
| `context.worker.reports` | Read `host.handlerCtx.storage.routes` and report blobs after initialization. |
| Worker queue and cluster objects | Use session progress and controls. Internal queue APIs have no direct replacement. |
| `context.logger` or `useLogger()` | Supply and retain a logger through the host factory's `logger` option. |

`host.core` and `host.handlerCtx` require initialized adapters.
Call `start()`, `setServerContext()`, or `generateClient()` before accessing them.
Hook registration works before initialization.

## Hooks

Remove the legacy `hooks` property from config files.
Populated config hooks raise `CONFIG_INVALID` instead of silently losing callbacks.
Register supported v1 events on `host.hooks` before starting the scan.

| Previous hook | v1 migration |
| --- | --- |
| `resolved-config(config)` | Supply the host factory's `onResolvedConfig(config)` callback. |
| `worker:complete` | Register `scan:complete({ scanId, summary })`. |
| `task:lighthouse:complete` | Register `scan:route-complete({ scanId, url, metrics })`. |
| `authenticate(page)` | No page-based replacement. Use headers, basic auth, or storage seeding where possible. |
| `puppeteer:before-goto` and other page hooks | No Puppeteer page replacement. |

The event payloads differ from legacy reports and contexts.
The `scan:route-complete` event contains metrics, not the complete Lighthouse result.
Read stored report blobs when you need more detail.

Use `onResolvedConfig` to inspect or adjust config before the host derives paths and initializes adapters:

```ts
import { createUnlighthouseHost } from 'unlighthouse'

const host = await createUnlighthouseHost({
  userConfig: { site: 'https://example.com' },
  onResolvedConfig(config) {
    console.log(config.site)
  },
})
```

`audit:before` supplies audit metadata.
It does not expose a browser page for login automation.
Keep page-based authentication integrations on 0.19 until you replace their browser flow.

## Reports and stored scans

JSON and CSV exports retain `ci-result.json` and `ci-result.csv` filenames.
Reporter aliases such as `json` and `csv` remain available.

V1 adds a `device` field to JSON rows and a final `Device` column to CSV exports.
Matrix scans can contain multiple rows for one path.
Use `(path, device)` as the row identity.
Read CSV columns by header name rather than fixed column count.

`csvExpanded` uses `ci.reporterConfig.columns` first, then `client.columns`.
Standard category labels remain `Performance`, `Accessibility`, `Best Practices`, and `SEO`.

Expanded JSON uses the reconciled report rather than the full Lighthouse result.
Numeric audit units can be empty because the reconciled contract omits them.
Read the raw Lighthouse blob when exact Lighthouse fields are required.

V1 stores scan records in SQLite and report artifacts in scan/device-specific blobs.
Legacy per-route JSON files are not imported automatically.
Run a new scan for the v1 dashboard.
Use storage APIs or dashboard downloads instead of depending on artifact filenames.

## Fetch helpers

`fetchUrlRaw()` response bodies are text.
Parse JSON explicitly when required.
Response headers use the web `Headers` API.

```ts
import { fetchUrlRaw } from 'unlighthouse'

const result = await fetchUrlRaw('https://example.com/data.json', {})
if (result.valid && result.response) {
  const contentType = result.response.headers.get('content-type')
  const data: unknown = JSON.parse(result.response.data)
  console.log(contentType, data)
}
```

Trailing slash normalization and configured default query parameters do not count as redirects.
Real redirects still return `redirected` and `redirectUrl`.
