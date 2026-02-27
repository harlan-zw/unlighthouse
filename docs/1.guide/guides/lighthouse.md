---
title: "Lighthouse Config & Desktop/Mobile Presets"
description: "Customize Lighthouse audit categories, throttling, and desktop/mobile presets in Unlighthouse. Pass any lighthouseOptions directly."
keywords:
  - lighthouse options
  - lighthouse configuration
  - lighthouse categories
  - customize lighthouse
  - lighthouse audit settings
  - lighthouse preset desktop
  - lighthouse preset mobile
  - unlighthouse preset
navigation:
  title: "Lighthouse Config"
relatedPages:
  - path: /guide/guides/device
    title: Device Configuration
  - path: /api-doc/config
    title: Config Reference
  - path: /glossary
    title: Core Web Vitals Glossary
---

Customize audit categories, performance thresholds, and behavior through the `lighthouseOptions` configuration key. Unlighthouse passes these options directly to Google Lighthouse.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  lighthouseOptions: {
    throttlingMethod: 'devtools',
  },
})
```

For complete options, see the [Lighthouse Configuration docs](https://raw.githubusercontent.com/GoogleChrome/lighthouse/refs/heads/main/docs/configuration.md).

## Aliases

Unlighthouse aims to minimise and simplify configuration, where possible.

For this reason, a number of configurations aliases are provided for your convenience.

- [Switching device: mobile and desktop](/guide/guides/device)
- [Toggle Throttling](/guide/guides/device#network-throttling)

You can always configure lighthouse directly if you are comfortable with the configuration.

## Selecting Categories

By default, Unlighthouse will scan the categories: `'performance', 'accessibility', 'best-practices', 'seo'`.

The performance category measures [Core Web Vitals](/glossary) including [LCP](/glossary/lcp), [CLS](/glossary/cls), and [INP](/glossary/inp).

It can be useful to remove certain categories from being scanned to improve scan times. The Unlighthouse UI will adapt
to any categories you select.

**Only Performance**

```ts
export default defineUnlighthouseConfig({
  lighthouseOptions: {
    onlyCategories: ['performance'],
  },
})
```
