---
title: Chrome Dependency
description: How to configure the Chrome dependency.
---

Unlighthouse aims to keep the installation size small, for this reason it depends natively on your locally installed
Chrome.

As a fallback, it will download a Chromium binary for you.

## Disabling system Chrome

You can disable the system chrome usage by modifying the `chrome.useSystem` flag. 

This will make Unlighthouse download and use the latest Chrome binary instead.

```ts
export default {
  chrome: {
    useSystem: false
  }
}
```

## Customizing the fallback installer

When Chrome can't be found on your system or if the `chrome.useSystem: false` flag is passed, then a fallback will be attempted.

This fallback will download a chrome binary for your system and use that path.

There are a number of options you can customize on this.

- `chrome.useDownloadFallback` - Disables the fallback installer
- `chrome.downloadFallbackVersion` - Which version of chromium to use (default `1095492`)
- `chrome.downloadFallbackCacheDir` - Where the binary should be saved (default `$home/.unlighthouse`)

```ts
export default {
  chrome: {
    useDownloadFallback: true,
    downloadFallbackVersion: '1095492',
    downloadFallbackCacheDir: '/tmp/unlighthouse'
  }
}
```

## Using your own chrome path

You can provide your own chrome path by setting `puppeteerOptions.executablePath`.

```ts
export default {
  puppeteerOptions: {
    executablePath: '/usr/bin/chrome'
  }
}
```
