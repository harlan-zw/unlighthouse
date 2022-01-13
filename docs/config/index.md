# Configuring Unlighthouse

<sponsor-banner />

## Configuration

There are multiple ways to configure unlighthouse, for this guide we'll be assuming you have a `unlighthouse.config.ts` in your root 
directory.

1. Load `unlighthouse.config.ts`
2. Pass `--config-file` option to the CLI or package, e.g. `unlighthouse --config ./path/to/unlighthouse.config.ts`

Alternatively configuration can be setup inline for whichever integration you've gone for.

```ts
/// <reference types="unlighthouse" />
import { defineConfig } from '@unlighthouse/core'

export default defineConfig({
    // example
    host: 'unlighthouse.dev',
    debug: true,
})
```

## Root Options

### host

- **Type:** `string`

The site that will be scanned.

### root

- **Type:** `string`
- **Default:** `cwd()`

The path that we'll be performing the scan from, this should be the path to the app that represents the site. 
Using this path we can auto-discover the provider

### cacheReports

- **Type:** `boolean`
- **Default:** `true`

Should reports be saved to the local file system and re-used between runs for the scanned host.

Note: This makes use of cache-bursting for when the configuration changes, since this may change the report output.

### configFile

- **Type:** `string|null`
- **Default:** `null`

Load the configuration from a custom config file. By default, it attempts to load configuration from `unlighthouse.config.ts`.

### outputPath

- **Type:** `string`
- **Default:** `./lighthouse/`

Where to emit lighthouse reports and the runtime client.

### debug

- **Type:** `boolean`
- **Default:** `false`

Have logger debug displayed when running.

## Router Options

These options change the behaviour of the router used to serve the API and the client.

### router.prefix

- **Type:** `string|null`
- **Default:** `null`

The path that the Unlighthouse middleware should run from. Useful when you want to serve the application from a frameworks existing server.

For example, you could run unlighthouse from `/__unlighthouse` if an existing server is running it.

```ts
import { defineConfig } from '@unlighthouse/core'

export default defineConfig({
    router: {
        // serve client from /__unlighthouse
        prefix: '/__unlighthouse'
    },
})
```

## CI Options

Change the behaviour of unlighthouse in CI mode.

### ci.budget

- **Type:** `number|Record<Partial<LighthouseCategories>, number>`
- **Default:** `null`

Provide a budget for each page as a numeric total score, or an object mapping the category to the score. Should be
a number between 1-100.

For example if you wanted to make sure all of your pages met a specific accessibility score, you could do:

```ts
import { defineConfig } from '@unlighthouse/core'

export default defineConfig({
    ci: {
        budget: {
            accessibility: 90
        }
    },
})
```

### ci.buildStatic

- **Type:** `boolean`
- **Default:** `false`

Injects the required data into the client files, so it can be hosted statically.

Combine this with uploading to a host, and you can see the results of your unlighthouse scan on a live site.

## API Options

### api.prefix

- **Type:** `string`
- **Default:** `/api/`

The path that the API should be served from. 

## Client Options

### client.columns

- **Type:** `Record<UnlighthouseTabs, UnlighthouseColumn[]>`

Modify the default columns used on the client. 

### client.groupRoutesKey

- **Type:** `string`
- **Default:** `route.definition.name`

Which key to use to group the routes.

## Discovery Options

### discovery.pagesDir

- **Type:** `string`
- **Default:** `./pages/`

The location of the page files that will be matched to routes.

Note: This is for fallback behaviour when the integration doesn't provide a way to gather the route definitions

### discovery.supportedExtensions

- **Type:** `string`
- **Default:** `./pages/`
- 
Which file extensions in the pages dir should be considered.

## Scanner Options

### scanner.include 

- **Type:** `string[]|null`
- **Default:** `null`

Paths to explicitly include from the search, this will exclude any paths not listed here.

### scanner.exclude

- **Type:** `string[]|null`
- **Default:** `null`

Paths to ignore from scanning.

### scanner.isHtmlSSR

- **Type:** `boolean`
- **Default:** `true`

Does javascript need to be executed in order to fetch internal links and SEO data. 

Disabling this can speed up scans but may break the parsing.

### scanner.samples

- **Type:** `number`
- **Default:** `1`

How many samples of each route should be done. This is used to improve false-positive results.

See [Run Lighthouse Multiple Times](https://github.com/GoogleChrome/lighthouse/blob/master/docs/variability.md#run-lighthouse-multiple-times).

### scanner.throttle

- **Type:** `boolean`
- **Default:** `true`

Should lighthouse run with throttling enabled. This is an alias for manually configuring lighthouse.

Note: This will be disabled by default for local scans.

### scanner.crawler

- **Type:** `boolean`
- **Default:** `true`
 
Should the crawler be used to detect URLs. This will parse the HTML of scanned pages for internal links and queue
them for scanning.

### scanner.dynamicSampling

- **Type:** `number|false`
- **Default:** `5`

When a route definition is provided, you're able to configure the worker to sample the dynamic routes to avoid
 redundant route reports.

### scanner.sitemap

- **Type:** `boolean`
- **Default:** `true`

Whether the sitemap.xml will be attempted to be read from the host.

## Lighthouse Options

Changes the default behaviour of lighthouse.

Useful for changing which categories will be scanned or which device to use.

```ts
import { defineConfig } from '@unlighthouse/core'

export default defineConfig({
    lighthouseOptions: {
        formFactor: 'desktop'
    },
})
```
See [Google Lighthouse options](https://github.com/GoogleChrome/lighthouse/blob/master/docs/configuration.md) for all available configurations.

## Puppeteer Options

Change the behaviour of puppeteer.

See [puppeteer.connect(options)](https://pptr.dev/#?product=Puppeteer&version=v13.0.1&show=api-puppeteerconnectoptions) for all available configurations.

## Puppeteer Cluster Options

Change the behaviour of puppeteer-cluster.

By default the concurrency will be set on the CPU cores you have available.

See [Cluster.launch(options)](https://github.com/thomasdondorf/puppeteer-cluster#clusterlaunchoptions) for available configuration.
