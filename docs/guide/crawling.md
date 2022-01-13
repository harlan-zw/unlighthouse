# Crawling

## Only use Sitemap pages

If you want to strictly follow the sitemap pages and disable the crawling feature, you can do:

```ts
export default defineConfig({
    scanner: {
        crawler: false
    }
})
```

## Skip sitemap check

If your site does not have a sitemap to scan, you can disable Unlighthouse's check for it.

```ts
export default defineConfig({
    scanner: {
        sitemap: false
    }
})
```
