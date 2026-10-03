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

The local Lighthouse auditor requires an installed Chrome browser.
Chrome Launcher discovers the browser used by each audit worker.

## Select an installed browser

```sh
CHROME_PATH=/usr/bin/google-chrome pnpm exec unlighthouse --site https://example.com
```

Set `CHROME_PATH` to the executable available on your machine or container.
Use `CHROME_FLAGS` for process arguments.
See [Chrome Options](/guide/guides/puppeteer).

## Previous download settings

Legacy `chrome.useSystem` and download-fallback options do not configure the v1 local auditor.
Install the browser before running scans.
`puppeteerOptions.executablePath` has no effect on the v1 local auditor.
