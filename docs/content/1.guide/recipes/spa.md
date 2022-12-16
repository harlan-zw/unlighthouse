# Handling SPAs

Unlighthouse assumes that the page being scanned is SSR,
meaning that it can parse internal links without executing the javascript.

By not executing javascript, Unlighthouse makes use of a basic fetch of the page HTML, decreasing scan time.

If you're using an SPA and relying on the `scanner.crawler` mode for URL discovery, you may want to change this behaviour.

## Wait for Javascript

By toggling this option, the HTML payload will be extracted by puppeteer once javascript is executed.

```ts
export default {
  scanner: {
    skipJavascript: false
  }
}
```


