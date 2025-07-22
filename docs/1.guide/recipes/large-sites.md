---
title: Handling large sites
description: How to handle large sites with Unlighthouse.
---

Unlighthouse is configured by default to run on any sized site and only perform _useful_ scans.

## Default configuration

Unlighthouse is configured by default to work on large sites. If you're scanning a smaller site you may consider
changing some of the following:

- [ignoreI18nPages](/api/config#scanner-ignorei18npages) enabled
- [maxRoutes](/api/config#scanner-maxroutes) set to 200
- [skipJavascript](/api/config#scanner-skipjavascript) enabled
- [samples](/api/config#scanner-samples) set to 1
- [throttling](/api/config#scanner-throttle) disabled
- [crawler](/api/config#scanner-crawler) enabled
- [dynamicSampling](/api/config#scanner-crawler) set to 5

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
export default {
  scanner: {
    exclude: [
      '/docs/*'
    ]
  }
}
```

## Include URL Patterns

Explicitly include paths; this will exclude any paths not listed here.

For example, if you run a blog and want to only scan your article and author pages.

```ts
export default {
  scanner: {
    include: [
      '/articles/*',
      '/authors/*'
    ]
  }
}
```

## Change Dynamic Sampling Limit

By default, a URLs will be matched to a specific route definition 5 times.

You can change the sample limit with:

```ts
export default {
  scanner: {
    // see 20 samples for each page file
    dynamicSampling: 20
  }
}
```

## Disabling Sampling

In cases where the route definitions aren't provided, a less-smart sampling will occur where URLs under the same parent
will be sampled.

For these instances you may want to disable the sample as follows:

```ts
export default {
  scanner: {
    // no dynamic sampling
    dynamicSampling: false
  }
}
```
