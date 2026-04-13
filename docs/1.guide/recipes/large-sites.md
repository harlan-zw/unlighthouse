---
title: "Bulk Lighthouse Testing for Large Sites"
description: "Scan large websites with thousands of pages efficiently. Configure sampling, URL filtering, and optimization strategies for bulk Lighthouse testing."
keywords:
  - bulk lighthouse test
  - scan entire website lighthouse
  - lighthouse all pages
  - site wide lighthouse
  - batch lighthouse
  - lighthouse thousands of pages
  - enterprise lighthouse
navigation:
  title: "Large Sites"
relatedPages:
  - path: /guide/guides/dynamic-sampling
    title: Dynamic Sampling
  - path: /guide/guides/url-discovery
    title: URL Discovery
  - path: /guide/guides/route-definitions
    title: Route Definitions
---

Scan websites with thousands of pages efficiently. Unlike single-page tools like PageSpeed Insights, Unlighthouse handles large sites with smart sampling, parallel scanning, and configurable limits.

- **Automatic discovery** - Finds all pages via sitemap and crawling
- **Smart sampling** - Tests representative pages from each template
- **Parallel scanning** - Multiple Chrome instances for speed
- **Aggregated results** - Site-wide scores and insights

Unlighthouse includes smart defaults for large sites. Understanding these helps balance completeness with performance.

## Default Large Site Configuration

These defaults optimize scanning for sites with thousands of pages:

- [ignoreI18nPages](/api-doc/config#scanner-ignorei18npages) enabled
- [maxRoutes](/api-doc/config#scanner-maxroutes) set to 200
- [skipJavascript](/api-doc/config#scanner-skipjavascript) enabled
- [samples](/api-doc/config#scanner-samples) set to 1
- [throttling](/api-doc/config#scanner-throttle) disabled
- [crawler](/api-doc/config#scanner-crawler) enabled
- [dynamicSampling](/api-doc/config#scanner-dynamicsampling) set to 5

For example, when scanning a blog with thousands of posts, it may be redundant to scan every single blog post, as the
DOM is very similar. Using the configuration we can select exactly how many posts should be scanned.

## Manually select URLs

You can configure Unlighthouse to use an explicit list of relative paths. This can be useful if you have a fairly complex
and large site.

See [Manually providing URLs](/guide/guides/url-discovery#manually-providing-urls) for more information.

## Provide Route Definitions (optional)

To make the most intelligent sampling decisions, Unlighthouse needs to know which page files are available. When running
using the
integration API, Unlighthouse will automatically provide this information.

Using the CLI you should follow the [providing route definitions](/guide/guides/route-definitions) guide.

Note: When no route definitions are provided it will match based on URL fragments, i.e `/blog/post-slug-3` will be
mapped to
`blog-slug`.

## Exclude URL Patterns

Paths to ignore from scanning.

For example, if your site has a documentation section, that doesn't need to be scanned.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    exclude: [
      '/docs/*',
    ],
  },
})
```

## Include URL Patterns

Explicitly include paths; this will exclude any paths not listed here.

For example, if you run a blog and want to only scan your article and author pages.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    include: [
      '/articles/*',
      '/authors/*',
    ],
  },
})
```

## Change Dynamic Sampling Limit

By default, a URLs will be matched to a specific route definition 5 times.

You can change the sample limit with:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    dynamicSampling: 20, // 20 samples per page template
  },
})
```

## Disabling Sampling

In cases where the route definitions aren't provided, a less-smart sampling will occur where URLs under the same parent
will be sampled.

For these instances you may want to disable the sample as follows:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    dynamicSampling: false, // Disable sampling completely
  },
})
```
