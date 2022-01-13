# Lighthouse Features

Unlighthouse is a wrapper for running the lighthouse binary, meaning all lighthouse options are available. To pass
configuration to lighthouse use the `lighthouseOptions` key in your configuration.

## Switching between mobile and desktop

By default, Unlighthouse will run the audit using an emulated mobile desktop.

To change it to desktop you can do:

```ts
export default defineConfig({
    scanner: {
        device: 'desktop',
    }
})
```

Note: This is an alias for setting the option yourself manually via `lighthouseOptions`.

## Choose The Categories Scanned

By default, Unlighthouse will scan the categories: `'performance', 'accessibility', 'best-practices', 'seo'`.

To change it to desktop you can do:

```ts
export default defineConfig({
    lighthouseOptions: {
        // must match keys 'performance', 'best-practices', 'accessibility', 'seo' or 'pwa'
        onlyCategories: ['performance', 'pwa'],
    }
})
```

## Enable PWA

If you'd like to scan your app with the PWA category use:

```ts
export default defineConfig({
    lighthouseOptions: {
        // must match keys
        onlyCategories: ['performance', 'best-practices', 'accessibility', 'seo', 'pwa'],
    }
})
```

## Enable/Disable Throttling

There are two types of throttling: CPU and network. Both are used in combination to emulate vistors to your site
who have poor internet connection and slow devices.

Unlighthouse will by default, throttle request to production sites for a more accurate performance score.

In development, it makes less sense to throttle as the network and CPU conditions for local development servers will skew the results.

If you would like to modify the throttling for each environment you can do:

```ts
export default defineConfig({
    scanner: {
        throttle: true
    }
})
```

Note: `throttle` is an alias for modifying `lighthouseOptions.throttlingMethod` and `lighthouseOptions.throttling`.


## Use Multiple Lighthouse Samples

Lighthouse recommends using multiple scans to improve the overall accuracy of the results. By default Unlighthouse
only performs one sample to improve speed.

If you'd like to opt-in to multiple samples you can do:

```ts
export default defineConfig({
    scanner: {
        // scan each URL 3 times and average the results
        samples: 3
    }
})
```_
