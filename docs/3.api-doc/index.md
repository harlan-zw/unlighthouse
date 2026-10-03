---
title: "API Reference"
description: "API Reference for the Unlighthouse v1 beta."
navigation:
  title: "API Reference"
relatedPages:
  - path: /api-doc/config
    title: Config Reference
  - path: /api-doc/glossary
    title: Glossary
  - path: /guide/guides/config
    title: Configuration Guide
---

Use `createUnlighthouseHost` for programmatic scans in Node.js.
Keep the returned host and pass it to your integration code.

## Create a host

```ts
import { createUnlighthouseHost } from 'unlighthouse'

const host = await createUnlighthouseHost({
  userConfig: {
    site: 'https://example.com',
    urls: ['/', '/about'],
  },
  behavior: { ws: null },
})
```

`userConfig` loads alongside your config file.
`behavior.ws: null` disables WebSocket broadcasting for scripts without a dashboard.
The factory also accepts an explicit `logger`, `env`, and custom `packs`.

## Prepare resolved config

Use `onResolvedConfig` before the host derives output paths and initializes adapters.

```ts
import { createUnlighthouseHost } from 'unlighthouse'

const host = await createUnlighthouseHost({
  userConfig: { site: 'https://example.com' },
  onResolvedConfig(config) {
    console.log(config.site)
  },
})
```

## Start and await a scan

```ts
const session = await host.start()
const { scanId, summary } = await session.done
console.log(scanId, summary.completed, summary.failed)
```

`start()` returns the started session.
Await `session.done` for completion and scan failures.

| Session member | Purpose |
| --- | --- |
| `stats()` | Read discovered, scanned, failed, and total counts. |
| `state()` | Read scan status. |
| `cancel(reason?)` | Cancel the scan. |
| `capabilities.pausable` | Check whether pause and resume are supported. |
| `pause()` and `resume()` | Control a supported crawler. |
| `events` | Iterate scan events. |
| `subscribe(handler)` | Subscribe and receive an unsubscribe function. |
| `replay(count)` | Read recent buffered events. |

## Register hooks

Register hooks before starting the scan:

```ts
host.hooks.hook('scan:route-complete', ({ url, metrics }) => {
  console.log(url, metrics.scorePerformance)
})

host.hooks.hook('scan:complete', ({ scanId, summary }) => {
  console.log(scanId, summary.completed)
})
```

Hook payloads contain typed scan data.
`scan:route-complete` contains metrics, rather than the full Lighthouse result.
Config-file `hooks` and Puppeteer page hooks are unsupported.

## Read reports and export the dashboard

After initializing the host, read scan records through storage:

```ts
const { items } = await host.handlerCtx.storage.routes.listForScan(session.scanId)
console.log(items)
await host.generateClient({ static: true })
```

`host.core` and `host.handlerCtx` require initialized adapters.
Call `start()`, `setServerContext()`, or `generateClient()` before accessing them.
Hook registration does not require storage initialization.

## Low-level adapters

`@unlighthouse/core` exports the core factory and adapters.
Use them when you need custom storage, crawling, seeds, or auditors.
The host factory supplies the Node.js runtime for ordinary integrations.

See [Migrating to v1](/guide/guides/migrating-to-v1) for removed global accessors and provider APIs.
