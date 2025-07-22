---
title: "Single-Page Applications"
description: "Configure Unlighthouse to properly scan single-page applications (SPAs) with client-side routing."
navigation:
  title: "SPAs"
---

## Introduction

By default, Unlighthouse assumes server-side rendered (SSR) pages where links are discoverable in the initial HTML. Single-page applications require JavaScript execution for proper link discovery and content rendering.

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
