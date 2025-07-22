---
title: "Route Definitions"
description: "Configure route discovery and custom sampling patterns for better page organization and intelligent scanning."
navigation:
  title: "Route Definitions"
---

## Introduction

Route definitions improve scanning intelligence by mapping URLs to source files and enabling better [dynamic sampling](/guide/guides/dynamic-sampling). Unlighthouse automatically discovers routes in framework integrations, but CLI users may need manual configuration.

## Pages directory

By default, the `pages/` dir is scanned for files with extensions `.vue` and `.md`, from the `root` directory.

If your project has a different setup you can modify the configuration.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  root: './app',
  discovery: {
    pagesDir: 'routes',
    fileExtensions: ['jsx', 'md'],
  },
})
```

## Custom sampling

When you have URL patterns which don't use URL segments or the mapping is failing, it can be useful to map the sampling
yourself.

By using the `customSampling` option you map regex to a route definition.

In the below example we will map any URL such as `/q-search-query`, `/q-where-is-the-thing` to a single route
definition, , which allows the sampling to work.

```ts
export default defineUnlighthouseConfig({
  scanner: {
    customSampling: {
      '/q-(.*?)': {
        name: 'search-query',
      },
    },
  },
})
```
