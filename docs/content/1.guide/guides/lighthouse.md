---
title: Configuring Google Lighthouse
description: How to configure Google Lighthouse using Unlighthouse.
---

Unlighthouse uses the [lighthouse node module](https://github.com/GoogleChrome/lighthouse) to perform scans.

### Lighthouse configuration

Any configuration available to lighthouse can be passed through on the `lighthouseOptions` key to change the behaviour
of the reports.

See [lighthouse configuration](https://github.com/GoogleChrome/lighthouse/blob/master/docs/configuration.md) for
details.

```ts
export default {
  lighthouseOptions: {
    throttlingMethod: 'devtools',
  }
}
```

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

**Only Performance and PWA**

```ts
export default {
  lighthouseOptions: {
    onlyCategories: ['performance', 'pwa'],
  }
}
```

**All Categories including PWA**

If you'd like to scan your app with the PWA category use:

```ts
export default {
  lighthouseOptions: {
    onlyCategories: ['performance', 'best-practices', 'accessibility', 'seo', 'pwa'],
  }
}
```
