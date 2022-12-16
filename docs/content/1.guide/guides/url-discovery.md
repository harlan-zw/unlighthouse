# Site Crawler


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

## Crawler

When enabled, the crawler will inspect the HTML payload of a page and extract internal links. 
These internal links will be queued up and scanned if they haven't already been scanned.

## Disable crawling

If you have many pages with many internal links, it may be a good idea to disable the crawling.

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
