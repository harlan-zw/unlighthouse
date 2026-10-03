---
title: "Scanning Large Sites"
description: "Scanning Large Sites for the Unlighthouse v1 beta."
navigation:
  title: "Large Sites"
relatedPages:
  - path: /guide/guides/dynamic-sampling
    title: Dynamic Sampling
  - path: /guide/guides/url-discovery
    title: URL Discovery
  - path: /guide/guides/route-definitions
    title: Route Definitions
---

Bound the scan or select representative routes before auditing a large site.

## Set a route limit

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  scanner: { maxRoutes: 100, exclude: ['/admin/*', '/api/*'] },
})
```

## Select representative routes

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  urls: ['/', '/blog/example', '/products/example'],
})
```

Explicit URLs stop link following.
Legacy dynamic sampling and custom sampling do not control the v1 scan pipeline.

## Name route templates

Use [Route Definitions](/guide/guides/route-definitions) to match concrete URLs to framework page templates.
Templates do not replace the concrete URLs needed for dynamic pages.

## Keep performance measurements reliable

Use `scanner.perfConcurrency: 'serial'` when comparing performance scores.
Increase `scanner.samples` when you need repeated audits, within the supported limit of 10.
See [Improving Accuracy](/guide/recipes/improving-accuracy).
