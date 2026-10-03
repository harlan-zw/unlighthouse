---
title: "Dynamic Sampling"
description: "Dynamic Sampling for the Unlighthouse v1 beta."
navigation:
  title: "Dynamic Sampling"
relatedPages:
  - path: /guide/guides/route-definitions
    title: Route Definitions
  - path: /guide/recipes/large-sites
    title: Large Sites
  - path: /guide/guides/url-discovery
    title: URL Discovery
---

The v1 scan pipeline does not apply legacy dynamic sampling or custom sampling rules.
Select representative URLs explicitly when a site has many similar pages.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  urls: ['/', '/blog/example', '/products/example'],
})
```

Explicit URLs stop link following.
Use `scanner.maxRoutes` to bound a larger scan.
`scanner.samples` repeats audits for each selected URL and does not select route groups.

For the previous sampling behavior, choose the 0.x documentation in the version switcher.
