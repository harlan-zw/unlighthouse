---
title: "Device Configuration"
description: "Configure device emulation settings for mobile and desktop scanning with custom dimensions and throttling options."
keywords:
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

Test performance across different screen sizes and network conditions. Configure mobile, desktop, or custom viewport settings with optional network throttling for realistic performance testing.

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
