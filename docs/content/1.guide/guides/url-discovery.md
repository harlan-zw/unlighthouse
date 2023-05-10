# Site Crawler


Unlighthouse comes with multiple methods for URL discovery in the form of crawling.

1. Add the specified `site` from `--site` or config
2. Manually providing URLs via the `--urls` flag or `urls` on the provider.
3. `robotsTxt` - Reading robots.txt, if it exists. Provides sitemap URLs and disallowed paths.
4. `sitemap` - Reading sitemap.xml, if it exists 
5. `crawler` - Inspecting internal links 
6. Using provided static [route definitions](/api/glossary/#route-definition)

## Robots.txt

When a robots.txt is found, it will attempt to read the sitemap and disallowed paths.

### Disabling robots

You may not want to use the robots.txt in all occasions. For example if you want to scan 
URLs which are disallowed.

  ```ts
  export default {
    scanner: {
      // disable robots.txt scanning
      robotsTxt: false
    }
  }
  ```


## Sitemap.xml

By default, the sitemap config will be read from your `/robots.txt`. Otherwise, it will fall back to using `/sitemap.xml`.

Note: When a sitemap exists with over 50 paths, it will disable the crawler.

### Manual sitemap paths

You may provide an array of sitemap paths to scan.

```ts
export default {
  scanner: {
    sitemap: [
      '/sitemap.xml',
      '/sitemap2.xml'
    ]
  }
}
```

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
