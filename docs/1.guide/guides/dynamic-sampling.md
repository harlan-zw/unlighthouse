---
title: "Dynamic Sampling"
description: "Automatically sample similar pages to reduce scan time for sites with many similar URLs like blogs or e-commerce."
keywords:
  - lighthouse sampling
  - scan subset of pages
  - lighthouse large site
  - reduce lighthouse scan time
  - lighthouse scan optimization
navigation:
  title: "Dynamic Sampling"
relatedPages:
  - path: /guide/guides/route-definitions
    title: Route Definitions
  - path: /guide/recipes/large-sites
    title: Large Sites
  - path: /guide/guides/url-discovery
    title: URL Discovery
---

Automatically group similar pages and scan only representative samples. This significantly reduces scan time for sites with many similar URLs like blogs, e-commerce product pages, or documentation sites.

## How it works

When dynamic sampling is enabled, it will group paths into chunks based on their path tree.

For example, let's imagine we have a blog on our site and there are hundreds of blog posts. Scanning every blog post will
take a long time and may even break Unlighthouse.

The path structure is `/blog/{post}`.

Unlighthouse will turn this path structure into groups based on the `/blog` prefix. By default, it will sample
5 paths starting with this prefix.

A sample being a random selection of paths within this group.

For example if we have the posts:

- `/blog/post-a`
- `/blog/post-b`
- `/blog/post-c`
- `/blog/post-d`
- `/blog/post-e`
- `/blog/post-f`
- `/blog/post-g`
- `/blog/post-h`
- `/blog/post-i`

After sampling, we may end up with the random selection:

- `/blog/post-c`
- `/blog/post-d`
- `/blog/post-e`
- `/blog/post-h`
- `/blog/post-i`

## Usage

It is configured using the `scanner.dynamicSampling` option.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    dynamicSampling: 10, // Number of samples per group (default: 5)
  },
})
```

### Disable Dynamic Sampling

```ts
export default defineUnlighthouseConfig({
  scanner: {
    dynamicSampling: false,
  },
})
```

Alternatively, you can disable it using the CLI `--disable-dynamic-sampling`.
