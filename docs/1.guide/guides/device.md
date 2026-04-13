---
title: "Unlighthouse --desktop Flag & Device Configuration"
description: "Run Unlighthouse in desktop mode with the --desktop flag: npx unlighthouse --site <url> --desktop. Configure mobile, desktop, or custom viewports with throttling."
keywords:
  - unlighthouse --desktop
  - unlighthouse --desktop flag
  - unlighthouse cli --desktop flag
  - unlighthouse cli desktop option
  - unlighthouse cli desktop flag
  - unlighthouse --device desktop
  - unlighthouse cli device desktop option
  - lighthouse mobile
  - lighthouse desktop
  - lighthouse device emulation
  - lighthouse viewport
  - lighthouse throttling
  - mobile performance testing
navigation:
  title: "Device Configuration"
relatedPages:
  - path: /guide/guides/lighthouse
    title: Lighthouse Configuration
  - path: /api-doc/config
    title: Config Reference
  - path: /glossary
    title: Core Web Vitals Glossary
---

Run Unlighthouse in desktop mode with the `--desktop` flag:

```bash
npx unlighthouse --site https://example.com --desktop
```

This overrides the default mobile emulation and scans every page using a desktop viewport. Prefer a config file? Set `scanner.device: 'desktop'` instead.

## When to use `--desktop`

Mobile is the default because Google uses mobile-first indexing. But desktop scans still matter for:

- B2B SaaS dashboards (95%+ desktop traffic)
- Admin panels and internal tools
- Documentation sites
- Benchmarking against PageSpeed Insights desktop scores

The `--desktop` flag is equivalent to the `--device desktop` long form and takes precedence over any config file setting.

## Device Types

### Desktop Scanning

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    device: 'desktop',
  },
})
```

### Mobile Scanning (Default)

```ts
export default defineUnlighthouseConfig({
  scanner: {
    device: 'mobile',
  },
})
```

## Custom Dimensions

Test specific viewport sizes for responsive breakpoints:

```ts
export default defineUnlighthouseConfig({
  lighthouseOptions: {
    screenEmulation: {
      width: 1800,
      height: 1000,
    },
  },
})
```

## Network Throttling

Throttling simulates slower network and CPU conditions for more realistic performance testing:

```ts
export default defineUnlighthouseConfig({
  scanner: {
    throttle: true,
  },
})
```

::note
Throttling is automatically enabled for production sites and disabled for localhost by default.
::
