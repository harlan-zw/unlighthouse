> 🪶 The Lighthouse primitive for the AI era.
>
> Sitewide Lighthouse audits with historical diffs, MCP, and a typed API. Runs in Node, Workers, or any modern JS runtime.

## Features

- 🤖 **Built for AI agents**: layered summaries your agent can read, not 200KB JSON dumps.
- 📱 **One scan, both devices**: mobile + desktop side-by-side, no double runs.
- 🌍 **Runs anywhere modern JS runs**: Node, Workers, BYO browser. ~10× lower compute cost on CF.
- 🧩 **Audit packs**: targeted fixes for perf, a11y, SEO; GEO next; ship your own.
- 🎛️ **Same tool everywhere**: terminal, agent, CI, browser. One typed API behind them all.
- 🧱 **Drop into your product**: embed the scan engine in your SaaS, agency tool, or platform.

## Why v1?

Lighthouse exists. Lighthouse-CI exists. Neither is portable across runtimes, neither is typed, neither handles a whole site, and neither produces output an agent can consume without bespoke glue. v1 fixes all four.

The agent-tooling space is already full of Lighthouse MCPs that wrap one URL and dump raw JSON. None of them crawl a site, group results by template, assert budgets, run in a Cloudflare Worker, or accept custom audit packs. v1 is built for that gap.

## What is Unlighthouse?

Unlighthouse crawls your entire site, runs Lighthouse against every route, and gives you actionable, prioritized reports plus scan-over-scan diffs. v1 turns that capability into a primitive: a Lighthouse-based scan engine designed to be composed, not just consumed. The same engine that powers the local dashboard powers an agent tool, a CI gate, or a serverless deploy.

The original Unlighthouse was a CLI that wrapped Lighthouse. v1 inverts that: **the engine is a primitive**, and the CLI is one host that consumes it. Other hosts ship in the same monorepo: an MCP server for agents, a Cloudflare Worker preset for serverless deploys, and a programmatic API for embedding into your own tools. They are all the same scan engine, projected through the same typed command registry.

## Who is it for?

Built by [Harlan Wilton](https://harlanzw.com), maintainer of [Nuxt SEO](https://nuxtseo.com) and [Nuxt SEO Pro](https://nuxtseo.com/pro), to power his own products. Same engine, available to you.

- **You, building on top.** Embed the scan engine in your own SaaS, agency tool, or internal platform. Bring your own browser (local Chrome, browserless.io, Cloudflare Browser Rendering). Bring your own storage (sqlite, Postgres, D1, S3, R2). The factory is six keys; the rest is yours.
- **You, driving an agent.** Add the MCP server to Claude Code, Cursor, or Cline. Ask "audit my site." Get back typed, layered results, not raw Lighthouse JSON. Run it from your laptop or from a Worker.
- **You, gating CI.** Scan a site, assert budgets, post a Markdown diff to a PR, fail the build on regression. The workflow v0 popularized, now with a typed contract, structured failures instead of silent stalls, and mobile + desktop in one run.

## What Unlighthouse is NOT

Strong non-goals; the vision is sharper for stating them.

- **Not a Lighthouse fork**. We consume Lighthouse, isolate its version inside a single module, and translate its output into a stable, typed shape. We do not maintain audit logic.
- **Not a hosted analytics SaaS that we run**. A hosted Unlighthouse cloud may come later; v1 is the engine, not the product. The cloud is one consumer of the engine, the same as everyone else.
- **Not Screaming Frog in OSS form**. Matching a 15-year breadth of SEO checks is a treadmill. v1 is the canonical OSS audit engine; dashboards and integrations are layers built on top.
- **Not a generic web crawler**. The crawler exists to feed audits. Link discovery, sitemap parsing, and route definitions are inputs, not the headline.
- **Not a real-user-monitoring (RUM) tool**. Lab data is the default; CrUX field data is an optional auditor. We surface both, we do not collect telemetry from real visitors.
- **Not backwards compatible with v0**. v1 deletes singletons, mode-discriminator branches, and the `provider.name` config. Migration is a clean break, not a shim.
- **Not opinionated about your runtime**. We do not bundle a database, a queue, a browser pool, or a deployment target. We ship adapters for the common shapes and document how to bring your own.
- **Not a closed surface**. Every host (CLI, MCP, Worker, custom) reads the same command registry. Add a transport, get every command for free.

## License

[MIT](./LICENSE.md) — Harlan Wilton
