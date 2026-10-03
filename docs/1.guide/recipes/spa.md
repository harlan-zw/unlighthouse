---
title: "Scanning Single Page Applications"
description: "Scanning Single Page Applications for the Unlighthouse v1 beta."
navigation:
  title: "SPAs"
relatedPages:
  - path: /guide/guides/url-discovery
    title: URL Discovery
  - path: /guide/guides/puppeteer
    title: Chrome Options
  - path: /glossary/lcp
    title: LCP for SPAs
---

Lighthouse audits application pages in Chrome.
The discovery crawler reads server-rendered HTML and does not execute JavaScript.

## Supply routes

Use a sitemap or explicit URLs when navigation links appear only after hydration.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'http://localhost:3000',
  urls: ['/', '/about', '/products'],
})
```

Each URL must load the application directly.
Configure your server to return the application shell for those paths.

## Legacy browser discovery

`--enable-javascript` does not enable browser-based link discovery in v1.
Puppeteer page hooks do not provide a hydration callback.
Read [Migrating to v1](/guide/guides/migrating-to-v1) before upgrading custom discovery integrations.
