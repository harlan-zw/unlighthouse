# @unlighthouse/pack-nuxt

A Nuxt-aware [Unlighthouse](https://unlighthouse.dev) pack. It reads a finished scan and rewrites the generic Lighthouse findings that fired into **Nuxt-idiomatic fixes** — e.g. `modern-image-formats` → "use `<NuxtImg>` from `@nuxt/image`", `render-blocking-resources` → "move critical tags to `useHead()`". Findings are aggregated across routes, so you get one entry per problem with the affected route list, ranked fails-first.

This package is also the **reference implementation for authoring a third-party pack**. A pack is just a reconciler plus a report schema; it depends only on `@unlighthouse/contracts/packs`, never on `@unlighthouse/core`.

## Usage

Register the pack when you build the host or the core:

```ts
import { createUnlighthouseHost } from 'unlighthouse'
import { nuxtPack } from '@unlighthouse/pack-nuxt'

const host = await createUnlighthouseHost({
  userConfig: { site: 'https://my-nuxt-site.com' },
  packs: [nuxtPack],
})
```

```ts
// or with the core factory directly
import { createUnlighthouseCore } from '@unlighthouse/core'
import { nuxtPack } from '@unlighthouse/pack-nuxt'

const core = createUnlighthouseCore({ /* ...ports */ packs: [nuxtPack] })
```

Then run it against a scan:

```ts
await client['pack.run']({ scanId, pack: 'nuxt' })
```

`pack.list` will include `nuxt`, and the pack auto-runs at scan completion alongside the built-ins.

## The report

`pack.run` returns a `NuxtReport`:

```ts
interface NuxtReport {
  scanId: string
  nuxtDetected: boolean          // true if a Nuxt stack pack was seen in any route
  routesAnalysed: number
  findings: Array<{
    auditId: string              // the Lighthouse audit that fired
    title: string | null
    fix: string                  // the Nuxt-idiomatic remediation
    module: string | null        // e.g. '@nuxt/image', '@nuxtjs/seo'
    docsUrl: string | null
    severity: 'warn' | 'fail'
    routeCount: number
    routes: string[]             // capped at 10
    estimatedSavings: { LCP?: number, FCP?: number, INP?: number, CLS?: number, TBT?: number } | null
  }>
}
```

## Authoring your own pack

Copy `src/index.ts` as a starting point. The shape is:

```ts
import type { Pack, PackReconcileCtx } from '@unlighthouse/contracts/packs'
import { z } from 'zod'

const MyReportSchema = z.object({ /* ... */ })

export const myPack: Pack<z.infer<typeof MyReportSchema>> = {
  name: 'my-pack',
  description: '…',
  version: '0.1.0',
  reportSchema: MyReportSchema,
  async reconciler(ctx: PackReconcileCtx) {
    // ctx.routes, ctx.getReconciled(url, device), ctx.getLhr(url, device), ctx.logger
    return { /* validated against reportSchema before it goes over the wire */ }
  },
}
```

Output is validated against `reportSchema` at the boundary, so a pack cannot lie about its shape. Prefer `ctx.getReconciled` (the lean, version-stable projection) over `ctx.getLhr` (raw Lighthouse JSON) unless you need a field the reconciled report does not carry.
