---
title: "Generating Static Reports"
description: "Generating Static Reports for the Unlighthouse v1 beta."
navigation:
  title: "Static Reports"
relatedPages:
  - path: /integrations/ci
    title: CI Integration
  - path: /guide/guides/config
    title: Configuration
  - path: /guide/recipes/client
    title: UI Customization
---

The CI executable can export a dashboard after a successful scan.

```sh
pnpm add -D unlighthouse@beta
pnpm exec unlighthouse-ci --site https://example.com --build-static --reporter json
```

Publish the generated client directory as static files.
Keep the complete directory so report assets remain available.

## Programmatic export

```ts
import { createUnlighthouseHost } from 'unlighthouse'

const host = await createUnlighthouseHost({
  userConfig: { site: 'https://example.com' },
  behavior: { ws: null },
})
const session = await host.start()
await session.done
await host.generateClient({ static: true })
```

## CI result files

JSON exports use `ci-result.json`; CSV exports use `ci-result.csv`.
These exports are separate from the static dashboard.
See [CI Integration](/integrations/ci) for reporter selection and device rows.
