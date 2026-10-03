---
title: "Authentication"
description: "Authentication for the Unlighthouse v1 beta."
navigation:
  title: "Authentication"
relatedPages:
  - path: /guide/guides/debugging
    title: Debugging
  - path: /guide/guides/puppeteer
    title: Chrome Options
  - path: /guide/guides/config
    title: Configuration
---

The local auditor supports basic auth, request headers, and browser storage seeding.
It does not expose Puppeteer pages for interactive login.

## Basic auth

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  auth: { username: process.env.SCAN_USERNAME || '', password: process.env.SCAN_PASSWORD || '' },
})
```

Keep credentials in environment variables.

## Headers and cookie headers

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  extraHeaders: {
    Authorization: `Bearer ${process.env.SCAN_TOKEN || ''}`,
    Cookie: `session=${process.env.SCAN_SESSION || ''}`,
  },
})
```

Headers reach Lighthouse and fetch helpers.
The `cookies` config option does not seed the local Lighthouse browser.

## Browser storage

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  localStorage: { token: process.env.SCAN_TOKEN || '' },
  sessionStorage: { session: process.env.SCAN_SESSION || '' },
})
```

Unlighthouse seeds these values before auditing the page.
Match the storage keys your application reads.

## Protected route discovery

The HTML crawler does not receive the authentication headers used by Lighthouse.
Authenticated HTML discovery therefore needs a custom crawler or another tested integration.
Keep affected integrations on 0.x until their replacement works.

## Page-based login

Legacy `authenticate(page)` and `puppeteer:before-goto` hooks have no v1 page replacement.
`audit:before` provides metadata and does not expose a browser page.
Read [Migrating to v1](/guide/guides/migrating-to-v1) before replacing a login flow.
