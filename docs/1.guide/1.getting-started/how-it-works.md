---
title: "How Unlighthouse Works"
description: "How Unlighthouse Works for the Unlighthouse v1 beta."
navigation:
  title: "How It Works"
relatedPages:
  - path: /guide/guides/url-discovery
    title: URL Discovery
  - path: /guide/guides/config
    title: Configuration
  - path: /glossary
    title: Core Web Vitals Glossary
---

The host loads config, discovers URLs, audits routes, and stores scan results.

## Load configuration

The Node.js host loads config files and applies CLI overrides.
It initializes storage and adapters when a scan or server needs them.

## Discover URLs

Seed sources provide configured URLs, sitemap entries, and static route definitions.
The HTML crawler can then follow links within the site.
It reads server-rendered HTML and does not execute JavaScript to discover links.
Explicit URLs and single-page mode stop link following.

## Audit routes

The local auditor launches headless Chrome and runs Lighthouse in worker threads.
Performance audits use a serial lane by default.
Repeated samples retain the median performance run.

## Store and display results

SQLite stores scan and route records.
Report blobs contain reconciled results and raw Lighthouse artifacts.
The dashboard receives scan updates through the host.
CI waits for scan completion before exporting reports and evaluating budgets.

## Extend the runtime

Use [the host API](/api-doc) for programmatic scans and typed hooks.
Custom core runtimes can supply their own storage, seed source, crawler, and auditor.
