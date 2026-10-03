---
title: "URL Discovery"
description: "URL Discovery for the Unlighthouse v1 beta."
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

The v1 host combines explicit URLs, sitemaps, and route definitions.
The crawler follows links from server-rendered HTML when link following is enabled.

## Sitemap URLs

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  scanner: { sitemap: ['https://example.com/sitemap.xml'], maxRoutes: 100 },
})
```

Set `scanner.sitemap: false` to disable sitemap discovery.
The v1 pipeline does not read legacy robots.txt sitemap or exclusion rules.
Provide sitemap URLs explicitly and configure `scanner.exclude` for excluded paths.

## Explicit URLs

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  urls: ['/', '/about', '/blog/example'],
})
```

Explicit URLs stop link following.
If you use a URL provider function, also supply `site`.

## Stop link following

Set `scanner.crawler: false` to audit only seed URLs.
Use `scanner.maxRoutes` to limit a scan that follows links.

## JavaScript-rendered links

The crawler does not render the application in a browser.
Use a sitemap or explicit URLs for routes whose links appear after JavaScript runs.
Lighthouse still audits each page in Chrome.

## Route names

Configure [Route Definitions](/guide/guides/route-definitions) to match URLs to framework page templates.
Dynamic templates need concrete URLs from another seed source or the crawler.
