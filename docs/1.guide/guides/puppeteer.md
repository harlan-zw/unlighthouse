---
title: "Puppeteer Launch Options"
description: "Configure Puppeteer launch options in Unlighthouse: headless mode, Chrome args, viewport settings, executable path, and navigation hooks."
keywords:
  - puppeteer launch options
  - puppeteer.launch options
  - puppeteer args
  - puppeteer headless
  - puppeteer chrome flags
  - lighthouse puppeteer
  - unlighthouse puppeteer
  - puppeteer no-sandbox
  - puppeteer docker
navigation:
  title: "Puppeteer"
relatedPages:
  - path: /guide/guides/chrome-dependency
    title: Chrome Dependency
  - path: /guide/guides/authentication
    title: Authentication
  - path: /guide/guides/docker
    title: Docker
---

Unlighthouse uses [Puppeteer](https://pptr.dev/) to control Chrome for Lighthouse audits. Configure browser behavior, navigation hooks, and Chrome flags via `puppeteerOptions`.

## All Available Options

```ts
export default defineUnlighthouseConfig({
  puppeteerOptions: {
    // See: https://pptr.dev/api/puppeteer.launchoptions
  },
})
```

Full reference: [Puppeteer LaunchOptions API](https://pptr.dev/api/puppeteer.launchoptions)

## Common Configurations

### Headless Mode

```ts
// Run with visible browser (debugging)
export default defineUnlighthouseConfig({
  puppeteerOptions: {
    headless: false,
  },
})
```

### Custom Chrome Executable

```ts
export default defineUnlighthouseConfig({
  puppeteerOptions: {
    executablePath: '/usr/bin/google-chrome',
  },
})
```

### Chrome Arguments

Common args for CI/Docker environments:

```ts
export default defineUnlighthouseConfig({
  puppeteerOptions: {
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  },
})
```

### Viewport Settings

```ts
export default defineUnlighthouseConfig({
  puppeteerOptions: {
    defaultViewport: {
      width: 1920,
      height: 1080,
    },
  },
})
```

### Timeout Configuration

```ts
export default defineUnlighthouseConfig({
  puppeteerOptions: {
    timeout: 60000, // 60 seconds
  },
})
```

### User Data Directory

Persist browser data between runs:

```ts
export default defineUnlighthouseConfig({
  puppeteerOptions: {
    userDataDir: './.puppeteer-data',
  },
})
```

## Navigation Hooks

Hook into Puppeteer's page navigation for custom logic.

### Before Page Load

```ts
export default defineUnlighthouseConfig({
  hooks: {
    'puppeteer:before-goto': async (page) => {
      // Set localStorage before navigation
      await page.evaluateOnNewDocument((token) => {
        localStorage.setItem('auth', token)
      }, process.env.AUTH_TOKEN)
    },
  },
})
```

### Modify Page Content

```ts
export default defineUnlighthouseConfig({
  hooks: {
    'puppeteer:before-goto': async (page) => {
      page.waitForNavigation().then(async () => {
        // Remove elements that cause CLS
        await page.evaluate(() => {
          document.querySelector('.cookie-banner')?.remove()
        })
      })
    },
  },
})
```

## Troubleshooting

### Chrome not found

See [Chrome Dependency Guide](/guide/guides/chrome-dependency).

### Connection refused in Docker

Add `--no-sandbox` and `--disable-dev-shm-usage` args.

### Memory issues

Reduce concurrent workers or add `--disable-dev-shm-usage`.
