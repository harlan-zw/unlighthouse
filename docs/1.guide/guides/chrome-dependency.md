---
title: "Chrome Dependency"
description: "Chrome Dependency for the Unlighthouse v1 beta."
navigation:
  title: "Chrome Dependency"
relatedPages:
  - path: /guide/guides/puppeteer
    title: Chrome Options
  - path: /guide/guides/common-errors
    title: Common Errors
  - path: /guide/guides/docker
    title: Docker
---

The local Lighthouse auditor requires Chrome.
Unlighthouse uses an installed browser when available.
If no browser exists, Unlighthouse downloads Chrome before the first audit.
Later audits reuse that browser.

## Select an installed browser

```sh
CHROME_PATH=/usr/bin/google-chrome pnpm exec unlighthouse --site https://example.com
```

Set `CHROME_PATH` to the executable available on your machine or container.
Use `CHROME_FLAGS` for process arguments.
See [Chrome Options](/guide/guides/puppeteer).

## Automatic downloads

Set `chrome.useSystem: false` to use the downloaded browser.
An existing `CHROME_PATH` takes precedence over this setting.
Clear `CHROME_PATH` to force the downloaded browser.
Set `chrome.useDownloadFallback: false` to require an installed browser.
Set `chrome.downloadFallbackVersion` to select a Chrome build.
Set `chrome.downloadFallbackCacheDir` to select the browser cache directory.

Lighthouse and Puppeteer download as one prebuilt package before the first audit.
The dashboard downloads when you open the CLI server or export a static report.
These downloads require npm and network access on first use.
Cached dependencies work offline.

The CLI excludes Lighthouse's upstream error-reporting dependencies from audit downloads.
Lighthouse library audits do not initialize that reporting system.
The CLI also excludes source maps, type declarations, unused assets, and translated audit text.
CLI audit output uses English.
Audit logic remains upstream Lighthouse code.
The standalone Core package keeps the dependencies supplied by its host.

Set `UNLIGHTHOUSE_RUNTIME_CACHE` to select the shared dependency cache.
The default follows `XDG_CACHE_HOME`, or uses `~/.cache/unlighthouse/runtime`.

`puppeteerOptions.executablePath` has no effect on the v1 local auditor.
