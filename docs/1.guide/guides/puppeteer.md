---
title: "Chrome Options"
description: "Chrome Options for the Unlighthouse v1 beta."
navigation:
  title: "Chrome Options"
relatedPages:
  - path: /guide/guides/chrome-dependency
    title: Chrome Dependency
  - path: /guide/guides/authentication
    title: Authentication
  - path: /guide/guides/docker
    title: Docker
---

The local auditor runs Lighthouse through Chrome Launcher.
It replaces the previous Puppeteer cluster.

## Chrome arguments

Set `CHROME_FLAGS` for Chrome process arguments:

```sh
CHROME_FLAGS="--no-sandbox --disable-setuid-sandbox" pnpm exec unlighthouse --site http://localhost:3000
```

The auditor launches Chrome in headless mode.
Install Chrome where Chrome Launcher can find it.

## Lighthouse options

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  lighthouseOptions: {
    onlyCategories: ['performance', 'accessibility'],
  },
})
```

Use [Device Configuration](/guide/guides/device) for device emulation.
Use [Authentication](/guide/guides/authentication) for browser storage seeding.

## Concurrency

Use `scanner.perfConcurrency: 'serial'` to protect performance measurements from concurrent audits.
Parallel performance audits trade measurement reliability for throughput.

## Legacy options

`puppeteerOptions` and `puppeteerClusterOptions` do not configure the local auditor.
Puppeteer page hooks, custom page objects, and cluster methods have no direct replacement.
Use the [migration guide](/guide/guides/migrating-to-v1) to assess custom browser flows.
