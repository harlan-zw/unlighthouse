---
title: "Lighthouse Configuration"
description: "Customize Google Lighthouse audit settings, categories, and performance thresholds within Unlighthouse scans."
navigation:
  title: "Lighthouse Config"
---

## Introduction

Unlighthouse provides direct access to Google Lighthouse configuration through the `lighthouseOptions` key. You can customize audit categories, performance thresholds, and scanning behavior.

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

- [Switching device: mobile and desktop]()
- [Toggle Throttling]()

You can always configure lighthouse directly if you are comfortable with the configuration.

## Selecting Categories

By default, Unlighthouse will scan the categories: `'performance', 'accessibility', 'best-practices', 'seo'`.

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
