---
title: "Route Definitions"
description: "Route Definitions for the Unlighthouse v1 beta."
navigation:
  title: "Route Definitions"
relatedPages:
  - path: /guide/guides/dynamic-sampling
    title: Dynamic Sampling
  - path: /guide/guides/url-discovery
    title: URL Discovery
  - path: /guide/guides/config
    title: Configuration
---

Route definitions map framework page files to URL templates and route names.

## Nuxt pages

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

`pagesDir` resolves relative to your project root.
Static page files can supply concrete seed URLs.
Dynamic page files supply templates for matching discovered URLs.

## Next.js pages

Use `framework: 'next'` and set `pagesDir` to your route directory.
Supply concrete dynamic URLs through a sitemap, crawler, or `urls`.

## Select representative routes

Legacy `scanner.customSampling` does not select routes in the v1 pipeline.
Use explicit `urls` for a representative selection.
Use `scanner.maxRoutes` to bound a broader scan.

Replace `discovery.pagesDir` and `discovery.supportedExtensions` with `routeDefinitions`.
See [Migrating to v1](/guide/guides/migrating-to-v1).
