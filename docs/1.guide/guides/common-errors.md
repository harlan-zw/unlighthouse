---
title: "Common Errors"
description: "Troubleshoot common issues encountered when running Unlighthouse scans, including browser connection and environment problems."
keywords:
  - lighthouse error
  - lighthouse not working
  - puppeteer error
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
    title: Puppeteer Configuration
---

Solutions for frequently encountered issues when running Unlighthouse scans. Ensure you're using the latest version before troubleshooting.

::tip
For general debugging techniques, see the [Debugging Guide](/guide/guides/debugging).
::

## `connect ECONNREFUSED 127.0.0.1:<port>`

**Example**

> Error: Unable to launch browser for worker, error message: connect ECONNREFUSED 127.0.0.1:51667

This error is thrown when Chromium is unable to launch. This happens when puppeteer is unable to connect to the browser.
This can be from a number of reasons:

- The environment is not configured correctly, likely when using Windows and WSL.
- You have a firewall or antivirus blocking Chrome or Chromium from launching or connecting to the required port.
- You are using an unsupported version of Chrome or Chromium.

**Windows and WSL Solution**

- Install Puppeteer on WSL following the [documentation](https://pptr.dev/troubleshooting#running-puppeteer-on-wsl-windows-subsystem-for-linux).
- Install Chrome in WSL following the [documentation](https://learn.microsoft.com/en-us/windows/wsl/tutorials/gui-apps#install-google-chrome-for-linux).

**Other Environments**

- You can try disabling the system Chrome, instead using the fallback.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  chrome: {
    useSystem: false,
  },
})
```
