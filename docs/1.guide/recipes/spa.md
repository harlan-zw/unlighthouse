---
title: "Single-Page Applications"
description: "Configure Unlighthouse to scan single-page applications (SPAs) with client-side routing like React, Vue, and Angular apps."
keywords:
  - lighthouse spa
  - lighthouse react
  - lighthouse vue
  - lighthouse angular
  - lighthouse client side rendering
  - spa performance testing
  - lighthouse csr
navigation:
  title: "SPAs"
relatedPages:
  - path: /guide/guides/url-discovery
    title: URL Discovery
  - path: /guide/guides/puppeteer
    title: Puppeteer Configuration
  - path: /glossary/lcp
    title: LCP for SPAs
---

Scan React, Vue, Angular, and other SPAs with client-side routing. SPAs require JavaScript execution for link discovery and accurate [Core Web Vitals](/glossary) measurement.

## Enable JavaScript Execution

Allow Puppeteer to execute JavaScript before extracting page content:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    skipJavascript: false, // Enable JS execution for SPAs
  },
})
```

## Wait for Hydration

SPAs often need time to hydrate. Configure wait conditions:

```ts
export default defineUnlighthouseConfig({
  scanner: {
    skipJavascript: false,
  },
  lighthouseOptions: {
    maxWaitForLoad: 45000, // Wait up to 45s for page load
  },
})
```

## Provide URLs Manually

If automatic crawling misses routes, provide them explicitly:

```ts
export default defineUnlighthouseConfig({
  urls: [
    '/',
    '/about',
    '/products',
    '/contact',
  ],
  scanner: {
    skipJavascript: false,
  },
})
```

## SPA Performance Considerations

SPAs typically have worse [LCP](/glossary/lcp) scores because:

- Content renders after JavaScript execution
- Initial HTML is often empty or minimal
- Hydration adds to [INP](/glossary/inp) delays

Consider SSR or SSG for content-heavy pages to improve Core Web Vitals.

::note
Enabling JavaScript execution increases scan time but is necessary for accurate SPA scanning.
::
