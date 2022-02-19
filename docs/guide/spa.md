# Scanning

Change the behaviour of the Unlighthouse route scanning.

## Wait for Javascript

When performing the HTML extraction task, Unlighthouse will by default, not wait for the Javascript to load.

This is to speed up the performance of the parse.

If your page is an SPA or requires Javascript to parse the HTML meta, you can opt-in to the wait with.

```ts
export default {
  scanner: {
    skipJavascript: false
  }
}
```


