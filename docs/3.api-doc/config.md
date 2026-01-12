---
title: "Configuration Reference"
description: "Complete reference for all Unlighthouse configuration options including types, defaults, and usage examples."
navigation:
  title: "Config Reference"
relatedPages:
  - path: /guide/guides/config
    title: Configuration Guide
  - path: /api-doc/glossary
    title: Glossary
---

Complete reference for all configuration options. For implementation guides, see [Configuration Guide](/guide/guides/config) or [CLI Arguments](/integrations/cli#configuration).

::note
Deprecated integration-specific options (Nuxt, Vite, webpack) are not documented here. Use CLI or CI integrations instead.
::

## Root Options

### `site`{lang="ts"}

- **Type:** `string`{lang="ts"}

The site that will be scanned.

### `root`{lang="ts"}

- **Type:** `string`{lang="ts"}
- **Default:** `cwd()`{lang="ts"}

The path that we'll be performing the scan from, this should be the path to the app that represents the site.
Using this path we can auto-discover the provider

### `cache`{lang="ts"}

- **Type:** `boolean`{lang="ts"}
- **Default:** `true`{lang="ts"}

Should reports be saved to the local file system and re-used between runs for the scanned site.

Note: This makes use of cache-bursting for when the configuration changes, since this may change the report output.

### `configFile`{lang="ts"}

- **Type:** `string|null`{lang="ts"}
- **Default:** `null`{lang="ts"}

Load the configuration from a custom config file. By default, it attempts to load configuration
from `unlighthouse.config.ts`.

You can set up multiple configuration files for different sites you want to scan.
For example:

- `staging-unlighthouse.config.ts`
- `production-unlighthouse.config.ts`

### `outputPath`{lang="ts"}

- **Type:** `string`{lang="ts"}
- **Default:** `./lighthouse/`{lang="ts"}

Where to emit lighthouse reports and the runtime client.

### `debug`{lang="ts"}

- **Type:** `boolean`{lang="ts"}
- **Default:** `false`{lang="ts"}

Display the loggers' debug messages.

### `auth`{lang="ts"}

- **Type:** `false | { username: string, password: string }`{lang="ts"}
- **Default:** `false`{lang="ts"}

Optional basic auth credentials.

### `cookies`{lang="ts"}

- **Type:** `false | CookieParam[]`{lang="ts"}
- **Default:** `false`{lang="ts"}

Provide cookies to be set for Axios and Puppeteer requests.

### `extraHeaders`{lang="ts"}

- **Type:** `false | Record<string, string>`{lang="ts"}
- **Default:** `false`{lang="ts"}

Provide extra headers to be set for Axios and Puppeteer requests.

### `userAgent`{lang="ts"}

- **Type:** `string`{lang="ts"}
- **Default:** `undefined`{lang="ts"}

Provide a custom user agent for all network requests.

### `defaultQueryParams`{lang="ts"}

- **Type:** `false | QueryObject`{lang="ts"}
- **Default:** `false`{lang="ts"}

Query params to add to every request.

### `hooks`{lang="ts"}

- **Type:** `NestedHooks<UnlighthouseHooks>`{lang="ts"}
- **Default:** `{}`{lang="ts"}

Hooks to run. See the [Hooks](/api-doc/#hooks) section for more information.

### `routerPrefix`{lang="ts"}

- **Type:** `string`{lang="ts"}
- **Default:** `''`{lang="ts"}

The URL path prefix for the client and API to run from.
Useful when you want to serve the application from an existing integrations server.

For example, you could run Unlighthouse from `/__unlighthouse` .

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  routerPrefix: '/__unlighthouse',
})
```

### `apiPrefix`{lang="ts"}

- **Type:** `string`{lang="ts"}
- **Default:** `/api/`{lang="ts"}

The path that the API should be served from.

### `urls`{lang="ts"}

- **Type:** `string[]|(() => string[])|(() => Promise<string[]>)`{lang="ts"}
- **Default:** `[]`{lang="ts"}

Provide a list of URLs that should be used explicitly. Will disable sitemap and crawler.

See [Manually Providing URLs](/guide/guides/url-discovery#manually-providing-urls).

## CI Options

Change the behaviour of unlighthouse in CI mode.

### `ci.budget`{lang="ts"}

- **Type:** `number|Record<Partial<LighthouseCategories>, number>`{lang="ts"}
- **Default:** `null`{lang="ts"}

Provide a budget for each page as a numeric total score, or an object mapping the category to the score.
Should be a number between 1-100.

For example, if you wanted to make sure all of your pages met a specific accessibility score, you could do:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  ci: {
    budget: {
      accessibility: 90,
    },
  },
})
```

### `ci.buildStatic`{lang="ts"}

- **Type:** `boolean`{lang="ts"}
- **Default:** `false`{lang="ts"}

Injects the required data into the client files, so it can be hosted statically.

Combine this with uploading to a site, and you can see the results of your unlighthouse scan on a live site.

## Client Options

See [Modifying client](/guide/recipes/client) for more information.

### `client.columns`{lang="ts"}

- **Type:** `Record<UnlighthouseTabs, UnlighthouseColumn[]>`{lang="ts"}

Modify the default columns used on the client.

### `client.groupRoutesKey`{lang="ts"}

- **Type:** `string`{lang="ts"}
- **Default:** `route.definition.name`{lang="ts"}

Which key to use to group the routes.

## Discovery Options

See [Route Definitions](/guide/guides/route-definitions) for more information.

### `discovery.pagesDir`{lang="ts"}

- **Type:** `string`{lang="ts"}
- **Default:** `./pages`{lang="ts"}

The location of the page files that will be matched to the routes.

Note: This is for fallback behaviour when the integration doesn't provide a way to gather the route definitions.

### `discovery.supportedExtensions`{lang="ts"}

- **Type:** `string`{lang="ts"}
- **Default:** `['vue', 'md']`{lang="ts"}

Which file extensions in the pages dir should be considered.

## Scanner Options

### `scanner.customSampling`{lang="ts"}

- **Type:** `Record<string, RouteDefinition>`{lang="ts"}
- **Default:** `{}`{lang="ts"}

Setup custom mappings for a regex string to a route definition.
This is useful when you have a complex site which doesn't use URL path segments
to separate pages.

See [custom sampling](/guide/guides/route-definitions#custom-sampling) for more information.

### `scanner.ignoreI18nPages`{lang="ts"}

- **Type:** `boolean`{lang="ts"}
- **Default:** `true`{lang="ts"}

When the page HTML is extracted and processed, we look for an `x-default` link to identify if the page is an i18n
copy of another page.
If it is, then we skip it because it would be a duplicate scan.

### `scanner.maxRoutes`{lang="ts"}

- **Type:** `number|false`{lang="ts"}
- **Default:** `200`{lang="ts"}

The maximum number of routes that should be processed.
This helps avoid issues when the site requires a specific
configuration to be able to run properly

### `scanner.include`{lang="ts"}

- **Type:** `string[]|null`{lang="ts"}
- **Default:** `null`{lang="ts"}

Paths to explicitly include from the search, this will exclude any paths not listed here.

See [Include URL Patterns](/guide/recipes/large-sites#include-url-patterns) for more information.

### `scanner.exclude`{lang="ts"}

- **Type:** `string[]|null`{lang="ts"}
- **Default:** `null`{lang="ts"}

Paths to ignore from scanning.

See [Exclude URL Patterns](/guide/recipes/large-sites#exclude-url-patterns) for more information.

### `scanner.skipJavascript`{lang="ts"}

- **Type:** `boolean`{lang="ts"}
- **Default:** `true`{lang="ts"}

Does javascript need to be executed in order to fetch internal links and SEO data.

Disabling this can speed up scans but may break the parsing.

See [Handling SPAs](/guide/recipes/spa) for more information.

### `scanner.samples`{lang="ts"}

- **Type:** `number`{lang="ts"}
- **Default:** `1`{lang="ts"}

How many samples of each route should be done. This is used to improve false-positive results.

See [Run Lighthouse Multiple Times](https://github.com/GoogleChrome/lighthouse/blob/master/docs/variability.md#run-lighthouse-multiple-times)
and [Improving Accuracy](/guide/recipes/improving-accuracy) for more information.

### `scanner.throttle`{lang="ts"}

- **Type:** `boolean`{lang="ts"}
- **Default:** `true`{lang="ts"}

Should lighthouse run with throttling enabled. This is an alias for manually configuring lighthouse.

Note: This will be disabled by default for local scans.

See [Network Throttling](/guide/guides/device#network-throttling) for more information.

### `scanner.crawler`{lang="ts"}

- **Type:** `boolean`{lang="ts"}
- **Default:** `true`{lang="ts"}

Should the crawler be used to detect URLs. This will parse the HTML of scanned pages for internal links and queue
them for scanning.

See [URL Discovery](/guide/guides/url-discovery) for more information.

### `scanner.dynamicSampling`{lang="ts"}

- **Type:** `number|false`{lang="ts"}
- **Default:** `5`{lang="ts"}

When a route definition is provided, you're able to configure the worker to sample the dynamic routes to avoid
redundant route reports.

See [Change Dynamic Sampling Limit](/guide/recipes/large-sites#change-dynamic-sampling-limit) for more information.

### `scanner.robotsTxt`{lang="ts"}

- **Type:** `boolean`{lang="ts"}
- **Default:** `true`{lang="ts"}

Should the robots.txt file be used for configuration.

Sitemap paths and disallows paths will be used to configure the scanner.

### `scanner.sitemap`{lang="ts"}

- **Type:** `boolean | string[]`{lang="ts"}
- **Default:** `true`{lang="ts"}

Either an array of sitemap paths, or a boolean to enable/disable sitemap scanning.

By default, when `true` is provided or an empty array, it will try and load the sitemap from `/sitemap.xml`.

Note: If you have `robotsTxt` enabled it will load sitemap config from here.

### `scanner.device`{lang="ts"}

- **Type:** `boolean | string`{lang="ts"}
- **Default:** `mobile`{lang="ts"}

Alias to switch the viewport dimentions used for scanning. Set to `desktop` for a viewport of 1350×950. Set to `false` if you want to manually configure it through `lighthouseOptions.formFactor`.

See [Device Configuration](/guide/guides/device) for more information.

## Lighthouse Options

Changes the default behaviour of Google Lighthouse.

See [Configure Google Lighthouse](/guide/guides/lighthouse) for more information.

## Puppeteer Options

Change the behaviour of puppeteer.

See [puppeteer.connect(options)](https://pptr.dev/#?product=Puppeteer&version=v13.0.1&show=api-puppeteerconnectoptions)
for all available configurations.

## Puppeteer Cluster Options

Change the behaviour of puppeteer-cluster.

By default the concurrency will be set on the CPU cores you have available.

See [Cluster.launch(options)](https://github.com/thomasdondorf/puppeteer-cluster#clusterlaunchoptions) for available
configuration.
