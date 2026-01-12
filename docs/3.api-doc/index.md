---
title: "API Reference"
description: "Complete API reference for Unlighthouse core functions, context methods, and hooks system."
navigation:
  title: "API Reference"
relatedPages:
  - path: /api-doc/config
    title: Config Reference
  - path: /api-doc/glossary
    title: Glossary
---

Programmatic API for building custom integrations and extending Unlighthouse functionality.

## Core Package

Functions from `@unlighthouse/core`:

### `createUnlighthouse()`{lang="ts"}

- **Type:** `(userConfig: UserConfig, provider?: Provider) => Promise<UnlighthouseContext>`{lang="ts"}

  This is the entry point to using Unlighthouse, it will initialise Unlighthouse with the provided configuration and an optional provider.

  When no provider is given, a default provider is created which will try and resolve route definitions and URLs.

  ```ts
  import { createUnlighthouse } from '@unlighthouse/core'

  createUnlighthouse(
    // config
    { configFile: 'mysite.config.ts' },
    // provider
    {
      name: 'custom',
      // some custom implementation to find the route definitions
      routeDefinitions: () => generateRouteDefinitions(),
    }
  )
  ```

### `defineUnlighthouseConfig()`{lang="ts"}

- **Type:** `(userConfig: UserConfig) => Promise<UnlighthouseContext>`{lang="ts"}

  A simple define wrapper to provide typings to config definitions. This is primarily used when creating a
  config file `unlighthouse.config.ts`

  Powered by [c12](https://github.com/unjs/c12).

  ```ts
  import { defineUnlighthouseConfig } from 'unlighthouse/config'

  export default defineUnlighthouseConfig({
    site: 'harlanzw.com'
  })
  ```

### `generateClient()`{lang="ts"}

- **Type:** `(options: GenerateClientOptions) => Promise<void>`{lang="ts"}

  This copies over the client from `@unlighthouse/client` to be used to render our scans details.

  It's publicly exposed to provide a tight integrations for custom client builds, such as the CI build.

  ```ts
  import { generateClient } from '@unlighthouse/core'

  // ...
  logger.info('Generating static client.')
  await generateClient({ static: true })
  logger.success(`Static client generated at \`${unlighthouse.runtimeSettings.generatedClientPath}\`, ready for hosting.`)
  ```

### `useUnlighthouse()`{lang="ts"}

- **Type:** `() => UnlighthouseContext`{lang="ts"}

  Unlighthouse makes use of a [composition API](https://github.com/unjs/unctx) to retain the core state. This allows you to access unlighthouse _anywhere_,
  which is great to avoid transferring state between your logic.

  ```ts
  import { useUnlighthouse } from '@unlighthouse/core'

  // access the lighthouse context, pick out the worker
  const { worker } = useUnlighthouse()
  // force whichever route matches home.md to be re-scanned
  worker.invalidateFile('/home.md')
  ```

### `useLogger()`{lang="ts"}

- **Type:** `() => void`{lang="ts"}

  Get the global logger instance. This is useful for tight unlighthouse integrations which want to make use of the
  `debug` config.

  ```ts
  import { useLogger } from '@unlighthouse/core'

  // you need to instantiate the logger to get the instance
  const logger = useLogger()
  // force whichever route matches home.md to be re-scanned
  logger.debug('Something weird has happened')
  ```

## @unlighthouse/server

Functions exposed from the `@unlighthouse/server` package.

This package is used for instances where unlighthouse is running without a provider which has an accessible web server. For instance
running Unlighthouse with the `cli` provider will use this package.

### `createServer()`{lang="ts"}

- **Type:** `() => Promise<void>`{lang="ts"}

  Creates a [h3](https://github.com/unjs/h3) app which uses [listhen](https://github.com/unjs/listhen) as a web server.
  This is used to host the API and the client.

  ```ts
  import { createServer } from '@unlighthouse/server'

  // ...
  const { server, app } = await createServer()
  // server is an instance of listhen, app is an instance of h3
  await unlighthouse.setServerContext({ url: server.url, server: server.server, app })
  await unlighthouse.start()
  ```

## Unlighthouse Context

Functions exposed from unlighthouse context provided by `useUnlighthouse()` or `createUnlighthouse()` .

### `start()`{lang="ts"}

- **Type:** `() => Promise<UnlighthouseContext>`{lang="ts"}

  Start the client and the queue worker. A server context must be provided before this function is called.

### `setCiContext()`{lang="ts"}

- **Type:** `() => Promise<UnlighthouseContext>`{lang="ts"}

  Running Unlighthouse via CI does not require a server or the client, so we have a special utility for it.

### `setServerContext()`{lang="ts"}

- **Type:** `(arg: ServerContextArg) => Promise<UnlighthouseContext>`{lang="ts"}

  To use Unlighthouse with a client, it needs a server / app to register the API and client middleware.

### `setSiteUrl()`{lang="ts"}

- **Type:** `(url: string) => void`{lang="ts"}

  Sets the site URL that will be scanned if it's not known at initialisation.

## Hooks

Unlighthouse provides hooks using [hookable](https://github.com/unjs/hookable) which allow you tailor the core behaviour.

Hooks can be accessed on the `hooks` property of the context and will always return a `Promise<void>|void`.

```ts
export type HookResult = Promise<void> | void
```

```ts
import { useUnlighthouse } from '@unlighthouse/core'

const { hooks } = useUnlighthouse()

hooks.hook('task-complete', (path, response) => {
  console.log('task is finished at path', path)
})
```

### `site-changed`{lang="ts"}

- **Type:** `(site: string) => HookResult`{lang="ts"}

  It's possible the site is not known at initialisation, this hook is called when it's set or changed.

  ```ts
  hooks.hook('site-changed', (site) => {
    // generate payload for site
  })
  ```

### `worker-finished`{lang="ts"}

- **Type:** `() => HookResult`{lang="ts"}

  Called when the worker has finished processing all queued routes. Will be called multiple times if routes are re-queued.

  Mostly useful for the CI environment.

  ```ts
  hooks.hook('worker-finished', () => {
    console.log('all done :)')
  })
  ```

### `route-definitions-provided`{lang="ts"}

- **Type:** `(routeDefinitions: any[]) => HookResult`{lang="ts"}

  When route definitions are provided to Unlighthouse this function will be called useful for delaying internal logic
  until the definitions are found.

### `visited-client`{lang="ts"}

- **Type:** `() => HookResult`{lang="ts"}

  Called when a user visits the path of the `@unlighthouse/client` for the first time. Useful for starting the worker on-demand.

  ```ts
  // only start when the user wants to see the client
  hooks.hookOnce('visited-client', () => {
    unlighthouse.start()
  })
  ```

### `task-added`{lang="ts"}

- **Type:** `(path: string, response: UnlighthouseRouteReport) => HookResult`{lang="ts"}

  Fired when a new task is added to the queue worker.

### `task-started`{lang="ts"}

- **Type:** `(path: string, response: UnlighthouseRouteReport) => HookResult`{lang="ts"}

  Fired when a task has started to work.

### `task-complete`{lang="ts"}

- **Type:** `(path: string, response: UnlighthouseRouteReport, taskName: string) => HookResult`{lang="ts"}

Fired when a task has completed it's work.

### `discovered-internal-links`{lang="ts"}

- **Type:** `(path: string, internalLinks: string[]) => HookResult`{lang="ts"}

Fired when a path discovered internal links, used for "crawl" mode.

### `puppeteer:before-goto`{lang="ts"}

- **Type:** `(page: Page) => HookResult`{lang="ts"}

After a page has been visited with puppeteer. Useful for running
