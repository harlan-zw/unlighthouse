---
title: Config
description: All the configuration options for Unlighthouse.
---

There are multiple ways to configure Unlighthouse. See the configuration documentation for your implementation.

- [Config file - unlighthouse.config.ts](/guide/guides/config)
- [CLI arguments](/integrations/cli#configuration)
- [Nuxt module options](/integrations/nuxt#configuration)
- [webpack plugin options](/integrations/webpack#configuration)
- [Vite plugin options](/integrations/vite#configuration)

## Root Options

### site

- **Type:** `string`

The site that will be scanned.

### root

- **Type:** `string`
- **Default:** `cwd()`

The path that we'll be performing the scan from, this should be the path to the app that represents the site.
Using this path we can auto-discover the provider

### cache

- **Type:** `boolean`
- **Default:** `true`

Should reports be saved to the local file system and re-used between runs for the scanned site.

Note: This makes use of cache-bursting for when the configuration changes, since this may change the report output.

### configFile

- **Type:** `string|null`
- **Default:** `null`

Load the configuration from a custom config file. By default, it attempts to load configuration
from `unlighthouse.config.ts`.

You can set up multiple configuration files for different sites you want to scan.
For example:

- `staging-unlighthouse.config.ts`
- `production-unlighthouse.config.ts`

### outputPath

- **Type:** `string`
- **Default:** `./lighthouse/`

Where to emit lighthouse reports and the runtime client.

### debug

- **Type:** `boolean`
- **Default:** `false`

Display the loggers' debug messages.

### auth

- **Type:** `false | { username: string, password: string }`
- **Default:** `false`

Optional basic auth credentials.

### cookies

- **Type:** ` false | CookieParam[]`
- **Default:** `false`

Provide cookies to be set for Axios and Puppeteer requests.

### extraHeaders

- **Type:** ` false | Record<string, string>`
- **Default:** `false`

Provide extra headers to be set for Axios and Puppeteer requests.

### defaultQueryParams

- **Type:** ` false | QueryObject`
- **Default:** `false`

Query params to add to every request.

### hooks

- **Type:** `NestedHooks<UnlighthouseHooks>`
- **Default:** `{}`

Hooks to run. See the [Hooks](/api/#hooks) section for more information.

### routerPrefix

- **Type:** `string`
- **Default:** `''`

The URL path prefix for the client and API to run from.
Useful when you want to serve the application from an existing integrations server.

For example, you could run Unlighthouse from `/__unlighthouse` .

```ts
export default {
  routerPrefix: '/__unlighthouse'
}
```

### apiPrefix

- **Type:** `string`
- **Default:** `/api/`

The path that the API should be served from.

### urls

- **Type:** `string[]|(() => string[])|(() => Promise<string[]>)`
- **Default:** `[]`

Provide a list of URLs that should be used explicitly. Will disable sitemap and crawler.

See [Manually Providing URLs](/guide/guides/url-discovery#manually-providing-urls).

## CI Options

Change the behaviour of unlighthouse in CI mode.

### ci.budget

- **Type:** `number|Record<Partial<LighthouseCategories>, number>`
- **Default:** `null`

Provide a budget for each page as a numeric total score, or an object mapping the category to the score.
Should be a number between 1-100.

For example, if you wanted to make sure all of your pages met a specific accessibility score, you could do:

```ts
export default {
  ci: {
    budget: {
      accessibility: 90
    }
  },
}
```

### ci.buildStatic

- **Type:** `boolean`
- **Default:** `false`

Injects the required data into the client files, so it can be hosted statically.

Combine this with uploading to a site, and you can see the results of your unlighthouse scan on a live site.

## Client Options

See [Modifying client](/guide/recipes/client) for more information.

### client.columns

- **Type:** `Record<UnlighthouseTabs, UnlighthouseColumn[]>`

Modify the default columns used on the client.

### client.groupRoutesKey

- **Type:** `string`
- **Default:** `route.definition.name`

Which key to use to group the routes.

## Discovery Options

See [Route Definitions](/guide/guides/route-definitions) for more information.

### discovery.pagesDir

- **Type:** `string`
- **Default:** `./pages`

The location of the page files that will be matched to the routes.

Note: This is for fallback behaviour when the integration doesn't provide a way to gather the route definitions.

### discovery.supportedExtensions

- **Type:** `string`
- **Default:** `['vue', 'md']`

Which file extensions in the pages dir should be considered.

## Scanner Options

### scanner.customSampling

- **Type:** `Record<string, RouteDefinition>`
- **Default:** `{}`

Setup custom mappings for a regex string to a route definition.
This is useful when you have a complex site which doesn't use URL path segments
to separate pages.

See [custom sampling](/guide/guides/route-definitions#custom-sampling) for more information.

### scanner.ignoreI18nPages

- **Type:** `boolean`
- **Default:** `true`

When the page HTML is extracted and processed, we look for an `x-default` link to identify if the page is an i18n
copy of another page.
If it is, then we skip it because it would be a duplicate scan.

### scanner.maxRoutes

- **Type:** `number|false`
- **Default:** `200`

The maximum number of routes that should be processed.
This helps avoid issues when the site requires a specific
configuration to be able to run properly

### scanner.include

- **Type:** `string[]|null`
- **Default:** `null`

Paths to explicitly include from the search, this will exclude any paths not listed here.

See [Include URL Patterns](/guide/recipes/large-sites#include-url-patterns) for more information.

### scanner.exclude

- **Type:** `string[]|null`
- **Default:** `null`

Paths to ignore from scanning.

See [Exclude URL Patterns](/guide/recipes/large-sites#include-url-patterns) for more information.

### scanner.skipJavascript

- **Type:** `boolean`
- **Default:** `true`

Does javascript need to be executed in order to fetch internal links and SEO data.

Disabling this can speed up scans but may break the parsing.

See [Handling SPAs](/guide/recipes/spa) for more information.

### scanner.samples

- **Type:** `number`
- **Default:** `1`

How many samples of each route should be done. This is used to improve false-positive results.

See [Run Lighthouse Multiple Times](https://github.com/GoogleChrome/lighthouse/blob/master/docs/variability.md#run-lighthouse-multiple-times)
and [Improving Accuracy](/guide/recipes/improving-accuracy) for more information.

### scanner.throttle

- **Type:** `boolean`
- **Default:** `true`

Should lighthouse run with throttling enabled. This is an alias for manually configuring lighthouse.

Note: This will be disabled by default for local scans.

See [Toggling Throttling](/guide/guides/device#alias-enable-disable-throttling) for more information.

### scanner.crawler

- **Type:** `boolean`
- **Default:** `true`

Should the crawler be used to detect URLs. This will parse the HTML of scanned pages for internal links and queue
them for scanning.

See [URL Discovery](/guide/guides/url-discovery) for more information.

### scanner.dynamicSampling

- **Type:** `number|false`
- **Default:** `5`

When a route definition is provided, you're able to configure the worker to sample the dynamic routes to avoid
redundant route reports.

See [Change Dynamic Sampling Limit](/guide/recipes/large-sites#change-dynamic-sampling-limit) for more information.

### scanner.robotsTxt

- **Type:** `boolean`
- **Default:** `true`

Should the robots.txt file be used for configuration.

Sitemap paths and disallows paths will be used to configure the scanner.

### scanner.sitemap

- **Type:** `boolean | string[]`
- **Default:** `true`

Either an array of sitemap paths, or a boolean to enable/disable sitemap scanning.

By default, when `true` is provided or an empty array, it will try and load the sitemap from `/sitemap.xml`.

Note: If you have `robotsTxt` enabled it will load sitemap config from here.

### scanner.device

- **Type:** `boolean | string`
- **Default:** `mobile`

Alias to switch the viewport dimentions used for scanning. Set to `desktop` for a viewport of 1350×950. Set to `false` if you want to manually configure it through `lighthouseOptions.formFactor`.

See [Switching between mobile and desktop](/guide/guides/device#alias-enable-disable-throttling) for more information.

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
