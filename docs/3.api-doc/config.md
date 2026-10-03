---
title: "Configuration Reference"
description: "Configuration Reference for the Unlighthouse v1 beta."
navigation:
  title: "Config Reference"
relatedPages:
  - path: /guide/guides/config
    title: Configuration Guide
  - path: /api-doc/glossary
    title: Glossary
  - path: /integrations/cli
    title: CLI Integration
---

Use `defineUnlighthouseConfig` from `unlighthouse/config` for typed project config.

## Root options

| Option | Purpose |
| --- | --- |
| `site` | Base site URL. Supply it alongside URL provider functions. |
| `root` | Project root for config lookup and relative paths. |
| `configFile` | Config filename or path. |
| `outputPath` | Directory for scan storage and exports. |
| `cache` | Preserve output, or reset it when false. |
| `debug` | Enable debug logging. |
| `urls` | Explicit URLs or a URL provider function. Disables link following. |
| `lighthouseOptions` | Lighthouse audit flags. |
| `extraHeaders` | Headers for fetch helpers and Lighthouse. |
| `auth` | Basic-auth username and password. |
| `defaultQueryParams` | Query parameters for fetch helpers. |

## Scanner

| Option | Purpose |
| --- | --- |
| `scanner.device` | Mobile or desktop for a single-device config. |
| `scanner.samples` | Audit repetitions, from 1 to 10. Keeps the median run. |
| `scanner.perfConcurrency` | Serial performance audits by default, or parallel audits with contended scores. |
| `scanner.include` and `scanner.exclude` | URL path filters. |
| `scanner.maxRoutes` | Maximum route count. |
| `scanner.mode` | Site scan or single-page scan. |
| `scanner.crawler` | Stop following links when false. |
| `scanner.sitemap` | Enable sitemap discovery, disable it, or supply sitemap URLs. |
| `scanner.ignoreI18nPages` | Skip localized duplicates with an x-default alternate URL. |
| `scanner.throttle` | Control the resolved Lighthouse throttling profile. |

JavaScript link discovery, dynamic sampling, custom sampling, and legacy robots.txt rules do not control the v1 pipeline.
See [URL Discovery](/guide/guides/url-discovery) for supported routes.

## Route definitions

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  routeDefinitions: { framework: 'nuxt', pagesDir: 'pages', extensions: ['vue', 'md'] },
})
```

`framework` accepts `nuxt` or `next`.
Replace legacy `discovery` settings with this option.

## CI

| Option | Purpose |
| --- | --- |
| `ci.budget` | Global or category score budget, using percentages. |
| `ci.reporter` | JSON, expanded JSON, CSV, expanded CSV, or false. |
| `ci.reporterConfig.columns` | Column arrays for expanded CSV. Takes precedence over `client.columns`. |
| `ci.buildStatic` | Generate a static dashboard after the scan. |
| `ci.assertions` | Assertions evaluated by the CI runner. |

An explicit reporter flag overrides the configured reporter.
Exports include a device value for each route result.

## Authentication

`localStorage`, `sessionStorage`, and `indexedDb` seed the local Lighthouse browser.
`cookies` applies to fetch helpers, but does not seed that browser.
The HTML crawler does not receive authentication headers.
See [Authentication](/guide/guides/authentication) before scanning protected pages.

## Removed runtime customization

Register supported events on `host.hooks`, rather than config-file `hooks`.
Use the host factory callback `onResolvedConfig` before initialization.
`puppeteerOptions` and `puppeteerClusterOptions` do not configure the local auditor.
See [Migrating to v1](/guide/guides/migrating-to-v1) for the supported replacements.
