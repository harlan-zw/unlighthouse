---
title: "Single-Page Applications"
description: "Configure Unlighthouse to properly scan single-page applications (SPAs) with client-side routing."
navigation:
  title: "SPAs"
relatedPages:
  - path: /guide/guides/url-discovery
    title: URL Discovery
  - path: /guide/guides/puppeteer
    title: Puppeteer Configuration
---

By default, Unlighthouse assumes SSR pages with links in initial HTML. SPAs require JavaScript execution for link discovery.

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

::note
Enabling JavaScript execution increases scan time but is necessary for accurate SPA scanning.
::
