# URL Discovery


Unlighthouse comes with multiple methods for URL discovery in the form of crawling.

1. Add the specified `site` from `--site` or config
2. Manually providing URLs via the `--urls` flag or `urls` on the provider.
3. `sitemap` - Reading sitemap.xml, if it exists 
4. `crawler` - Inspecting internal links 
5. Using provided static [route definitions](/glossary/#route-definition)


## Sitemap

When a sitemap is with a medium-sized threshold (50 URLS), it will disable the crawler.

### Disabling scan

If you know your site doesn't have a sitemap, it may make sense to disable it.

```ts
export default {
  scanner: {
    // disable sitemap scanning
    sitemap: false
  }
}
```

## Disable crawling

If you want to strictly follow the sitemap pages and disable the crawling feature, you can do:

```ts
export default {
  scanner: {
    crawler: false
  }
}
```

## Manually Providing URLs

While not recommended for most use cases, you may provide relative URLs within your configuration file, or use the `--urls` flag.

This will disable the crawler and sitemap scanning.

Can be provided statically.

```ts unlighthouse.config.ts
export default {
  urls: [
    '/about',
    '/other-page'
  ],
}
```

Or you can return a function or promise.

```ts unlighthouse.config.ts
export default {
  urls: async () => await getUrls()
}
```

Specify explicit relative URLs as a comma-seperated list.

```bash
unlighthouse --site https://example.com --urls /about,/other-page
```
