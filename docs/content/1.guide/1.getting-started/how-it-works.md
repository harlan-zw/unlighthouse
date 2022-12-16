# How it works

Unlighthouse has multiple steps, aimed at only running logic when it's needed.

The core logic is as follows

## 1. Instantiation

Configuration is loaded from `unlighthouse.config.ts` or a custom `configFile`.

```ts
const unlighthouse = await createUnlighthouse(config)
```

### Worker

A new [puppeteer-cluster](https://github.com/thomasdondorf/puppeteer-cluster) is created.

## 2. Server Context Provided

Once the context is provided for which site is being scanned and server details.

```ts
// create a server to serve the client from
const { server, app } = await createServer()
await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
```

### API

An [unrouted](https://github.com/harlan-zw/unrouted) API instance is created.

### Client

[Vite](https://github.com/vitejs/vite) client is copied from the `node_modules` and is injected with static
configuration for the scan

## 3. Start

For integrations, Unlighthouse will only start when accessed. Otherwise, Unlighthouse is started straight away.

```ts
hooks.hookOnce('visited-client', () => {
  unlighthouse.start()
})
```

### Context

Discovery of the [route definitions](/api/glossary/#route-definition) is attempted. A virtual router for the route
definitions is created.

Start collecting the list of URLs to work with from the sitemap.xml, if no sitemap is discovered, the home page will be
scanned.

### Worker

For each URL:

1. perform a GET and extract HTML payload for basic SEO data and discover new internal links
2. In a new thread, perform the lighthouse scan, the HTML and JSON payload of the report will be saved to the filesystem

### Client

Broadcasting setup on worker events.

## 3. Using the client

### API

The [unrouted](https://github.com/harlan-zw/unrouted) API instance routes requests to the worker to perform actions.
Static files such as the full-page screenshot and lighthouse HTML report are served.

