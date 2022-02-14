# Scanning

Change the behaviour of the Unlighthouse route scanning.

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

## Alias: Switching between mobile and desktop

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

## Alias: Enable/Disable Throttling

There are two types of throttling: CPU and network. Both are used in combination to emulate vistors to your site who
have poor internet connection and slow devices.

Unlighthouse will by default, throttle request to production sites for a more accurate performance score.

In development, it makes less sense to throttle as the network and CPU conditions for local development servers will
skew the results.

If you would like to modify the throttling for each environment you can do:

```ts
export default defineConfig({
  scanner: {
    throttle: true
  }
})
```

Note: `throttle` is an alias for modifying `lighthouseOptions.throttlingMethod` and `lighthouseOptions.throttling`.


