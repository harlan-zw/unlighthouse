---
title: "URL Discovery"
description: "How Unlighthouse discovers pages using sitemaps, robots.txt, and internal link crawling. Configure URL sources and filters."
keywords:
  - lighthouse sitemap
  - crawl website lighthouse
  - lighthouse all pages
  - automatic url discovery
  - lighthouse find all pages
navigation:
  title: "URL Discovery"
relatedPages:
  - path: /guide/guides/route-definitions
    title: Route Definitions
  - path: /guide/recipes/large-sites
    title: Large Sites
  - path: /guide/guides/config
    title: Configuration
---

Unlighthouse automatically finds all pages on your site using multiple discovery methods. Configure which sources to use and filter results to scan exactly what you need.

Unlighthouse discovers URLs through multiple methods:

1. Add the specified `site` from `--site` or config
2. Manually providing URLs via the `--urls` flag or `urls` on the provider.
3. `robotsTxt` - Reading robots.txt, if it exists. Provides sitemap URLs and disallowed paths.
4. `sitemap` - Reading sitemap.xml, if it exists
5. `crawler` - Inspecting internal links
6. Using provided static [route definitions](/api-doc/glossary#route-definition)

## Robots.txt

When a robots.txt is found, it will attempt to read the sitemap and disallowed paths.

### Disabling robots

You may not want to use the robots.txt in all occasions. For example if you want to scan
URLs which are disallowed.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    // disable robots.txt scanning
    robotsTxt: false,
  },
})
```

## Sitemap.xml

By default, the sitemap config will be read from your `/robots.txt`. Otherwise, it will fall back to using `/sitemap.xml`.

Note: When a sitemap exists with over 50 paths, it will disable the crawler.

### Manual sitemap paths

You may provide an array of sitemap paths to scan.

```ts
export default defineUnlighthouseConfig({
  scanner: {
    sitemap: [
      '/sitemap.xml',
      '/sitemap2.xml',
    ],
  },
})
```

### Disabling scan

If you know your site doesn't have a sitemap, it may make sense to disable it.

```ts
export default defineUnlighthouseConfig({
  scanner: {
    // disable sitemap scanning
    sitemap: false,
  },
})
```

## Crawler

When enabled, the crawler will inspect the HTML payload of a page and extract internal links.
These internal links will be queued up and scanned if they haven't already been scanned.

## Disable crawling

If you have many pages with many internal links, it may be a good idea to disable the crawling.

```ts
export default defineUnlighthouseConfig({
  scanner: {
    crawler: false,
  },
})
```

## Manually Providing URLs

While not recommended for most use cases, you may provide relative URLs within your configuration file, or use the `--urls` flag.

This will disable the crawler and sitemap scanning.

Can be provided statically.

```ts
export default defineUnlighthouseConfig({
  urls: [
    '/about',
    '/other-page',
  ],
})
```

Or you can return a function or promise.

```ts
export default defineUnlighthouseConfig({
  urls: async () => await getUrls(),
})
```

Specify explicit relative URLs as a comma-separated list.

```bash
unlighthouse --site https://example.com --urls /about,/other-page
```
