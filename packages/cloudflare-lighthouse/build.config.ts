import { defineBuildConfig } from 'obuild/config'

// Two separate bundles by design — keeps the Worker bundle hermetic.
//
// `worker-helper.ts` runs inside a Cloudflare Worker; it must NOT
// transitively reference `lighthouse` or `puppeteer-core`. The only path
// it touches is `@unlighthouse/core/auditors/remote-lighthouse`, which
// itself only depends on `ofetch`.
//
// `server.ts` runs inside the Cloudflare Container (Node 24). It imports
// `createCdpConnectAuditor` from `@unlighthouse/core/auditors/cdp-connect`,
// which pulls `lighthouse` + `puppeteer-core`. That's fine — the
// Container is a real Node host, not a Workers runtime.
export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/worker-helper.ts'],
      rolldown: {
        external: [
          '@cloudflare/workers-types',
          '@unlighthouse/contracts',
          '@unlighthouse/contracts/ports',
          '@unlighthouse/core/auditors/remote-lighthouse',
        ],
      },
    },
    {
      type: 'bundle',
      input: ['./src/server.ts'],
      rolldown: {
        external: [
          'lighthouse',
          'puppeteer-core',
          'h3',
          'ofetch',
          '@unlighthouse/contracts',
          '@unlighthouse/contracts/ports',
          '@unlighthouse/core/auditors/cdp-connect',
        ],
      },
    },
  ],
})
