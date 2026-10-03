---
title: "Common Errors"
description: "Troubleshoot common issues encountered when running Unlighthouse scans, including browser connection and environment problems."
keywords:
  - lighthouse error
  - lighthouse not working
  - chrome connection refused
  - wsl lighthouse
  - lighthouse troubleshooting
navigation:
  title: "Common Errors"
relatedPages:
  - path: /guide/guides/debugging
    title: Debugging
  - path: /guide/guides/chrome-dependency
    title: Chrome Dependency
  - path: /guide/guides/puppeteer
    title: Chrome Options
---

## Chrome cannot launch

If Chrome Launcher cannot find a browser, install Chrome in the environment running Unlighthouse.
Set `CHROME_PATH` to that browser executable:

```sh
CHROME_PATH=/usr/bin/google-chrome pnpm exec unlighthouse-ci --site https://example.com
```

If Chrome starts but connection fails, check firewall rules and browser permissions.
If you use WSL, install Chrome inside WSL.
Legacy `chrome.useSystem` and Puppeteer executable options do not configure the v1 local auditor.
See [Chrome Dependency](/guide/guides/chrome-dependency) for supported settings.

## Config hooks fail

If config loading raises `CONFIG_INVALID` for hooks, remove the config-file `hooks` property.
Register supported events on `host.hooks` before starting a programmatic scan.
Use `onResolvedConfig` for the host factory config callback.
See [Migrating to v1](/guide/guides/migrating-to-v1).

## Routes are missing

If links need JavaScript, supply explicit `urls` or a sitemap.
The HTML crawler does not execute JavaScript or receive Lighthouse authentication headers.
See [URL Discovery](/guide/guides/url-discovery) and [Authentication](/guide/guides/authentication).

## Enable logs

Run the failing command with `--debug`.
See [Debugging](/guide/guides/debugging) for a single-route check.
