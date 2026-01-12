---
title: "Lighthouse Configuration"
description: "Customize Google Lighthouse audit settings, categories, and performance thresholds within Unlighthouse scans."
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

Configure Lighthouse through the `lighthouseOptions` key to customize audit categories, thresholds, and behavior.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  lighthouseOptions: {
    throttlingMethod: 'devtools',
  },
})
```

For complete options, see the [Lighthouse Configuration docs](https://github.com/GoogleChrome/lighthouse/blob/master/docs/configuration.md).

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
