---
title: "Chrome Dependency"
description: "Configure Chrome browser settings for Unlighthouse scanning, including system Chrome usage and custom installations."
keywords:
  - lighthouse chrome
  - puppeteer chrome
  - chromium lighthouse
  - chrome executable path
  - lighthouse browser
navigation:
  title: "Chrome Dependency"
relatedPages:
  - path: /guide/guides/puppeteer
    title: Puppeteer Configuration
  - path: /guide/guides/common-errors
    title: Common Errors
  - path: /guide/guides/docker
    title: Docker
---

Unlighthouse uses your system Chrome installation to keep package size minimal. When Chrome isn't available, it automatically downloads a compatible Chromium binary.

## Disabling system Chrome

You can disable the system chrome usage by modifying the `chrome.useSystem` flag.

This will make Unlighthouse download and use the latest Chrome binary instead.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  chrome: {
    useSystem: false
  },
})
```

## Customizing the fallback installer

When Chrome can't be found on your system or if the `chrome.useSystem: false` flag is passed, then a fallback will be attempted.

This fallback will download a chrome binary for your system and use that path.

There are a number of options you can customize on this.

- `chrome.useDownloadFallback` - Disables the fallback installer
- `chrome.downloadFallbackVersion` - Which version of chromium to use (default `1095492`)
- `chrome.downloadFallbackCacheDir` - Where the binary should be saved (default `$home/.unlighthouse`)

```ts
export default defineUnlighthouseConfig({
  chrome: {
    useDownloadFallback: true,
    downloadFallbackVersion: '1095492',
    downloadFallbackCacheDir: '/tmp/unlighthouse',
  },
})
```

## Using your own chrome path

You can provide your own chrome path by setting `puppeteerOptions.executablePath`.

```ts
export default defineUnlighthouseConfig({
  puppeteerOptions: {
    executablePath: '/usr/bin/chrome',
  },
})
```
