---
title: "How It Works"
description: "How Unlighthouse scans your site - the simple explanation."
navigation:
  title: "How It Works"
---

## Introduction

Unlighthouse scans your website in a few simple steps. It finds all your pages, runs Lighthouse on each one, then shows you the results.

Here's how it works under the hood.

## How It Starts

### 1. Setup

First, Unlighthouse loads your config file using the [c12](https://github.com/unjs/c12) package. This supports TypeScript config files and gives you a global `defineUnlighthouseConfig` function for type support:

::code-group

```ts [Configuration Loading]
const unlighthouse = await createUnlighthouse(config)
```

```ts [unlighthouse.config.ts]
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  scanner: {
    samples: 3,
    throttle: true,
  },
})
```

::

#### Browser Workers

Unlighthouse creates a pool of Chrome browsers using [puppeteer-cluster](https://github.com/thomasdondorf/puppeteer-cluster):

- Opens multiple Chrome instances
- Each one can scan a different page
- Runs scans in parallel to go faster

### 2. Report Site Setup

Unlighthouse starts a local web server so you can see the results:

```ts
// Create server for the UI client
const { server, app } = await createServer()
await unlighthouse.setServerContext({
  url: server.url,
  server: server.server,
  app
})
```

#### API

The [unrouted](https://github.com/harlan-zw/unrouted) API handles:

- Sending scan updates to your browser
- Serving Lighthouse reports
- Managing the scanning process

#### Web App

A [Vite](https://github.com/vitejs/vite) web app that:

- Shows scan progress in real-time
- Displays all the Lighthouse scores
- Lets you filter and explore results

### 3. The Actual Scanning

#### When It Starts

Unlighthouse can start in two ways:

::code-group

```ts [Immediate Start]
// CLI mode - starts immediately
unlighthouse.start()
```

```ts [Lazy Start]
// Integration mode - waits for first client access
hooks.hookOnce('visited-client', () => {
  unlighthouse.start()
})
```

::

#### Finding Your Pages

Unlighthouse finds pages to scan in a few ways:

1. **Route Files**: Reads your framework's route files (like Next.js pages)
2. **Robots.txt**: Checks your robots.txt file for sitemap links
3. **Sitemap.xml**: Gets all URLs from your sitemap
4. **Crawling**: If no sitemap, it starts from your homepage and follows links

::tip
Having a sitemap.xml makes scanning much faster and finds more pages.
::

#### What Happens to Each Page

For every URL it finds, Unlighthouse does two things:

##### Step 1: Quick HTML Check
- Makes a simple HTTP request to get the HTML
- Grabs basic info like title, meta tags
- Looks for more links to scan

##### Step 2: Full Lighthouse Scan
- Opens the page in Chrome
- Runs all the Lighthouse tests
- Saves the report as HTML and JSON files

#### Live Updates

While scanning, the report page updates in real-time:

- Shows how many pages are done
- Updates the progress bar
- Shows results as soon as each page finishes
