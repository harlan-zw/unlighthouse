# Scanning

Change the behaviour of the Unlighthouse route scanning.

## Include / Exclude URLs

You can choose to include or exclude path patterns to control which URLs are scanned. 

This is useful for sites with hundreds to thousands routes.

### Include

Explicitly include paths, this will exclude any paths not listed here.

For example, if you run a blog and want to only scan your article and author pages.

```ts
export default defineConfig({
    scanner: {
        include: [
            '/articles/*',
            '/authors/*'
        ]
    }
})
```

### Exclude

Paths to ignore from scanning.

For example, if your site has a documentation section that doesn't need to be scanned

```ts
export default defineConfig({
    scanner: {
        exclude: [
            '/docs/*'
        ]
    }
})
```


## Wait for Javascript

When performing the HTML extraction task, Unlighthouse will by default, not wait for the Javascript to load.

This is to speed up the performance of the parse. 

If your page is an SPA or requires Javascript to parse the HTML meta, you can opt-in to the wait with.

```ts
export default defineConfig({
    scanner: {
        skipJavascript: false
    }
})
```

