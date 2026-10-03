---
title: "API Glossary"
description: "API Glossary for the Unlighthouse v1 beta."
navigation:
  title: "API Glossary"
relatedPages:
  - path: /api-doc
    title: API Reference
  - path: /api-doc/config
    title: Config Reference
  - path: /guide/guides/route-definitions
    title: Route Definitions Guide
---

## Host

The host loads config and connects the Node.js runtime, storage, core, and dashboard.
`createUnlighthouseHost` returns the host.

## Core

The core coordinates seed URLs, crawling, audits, and stored reports.
Custom runtimes can construct it with explicit adapters.

## Session

A session represents one scan.
It exposes a scan identifier, completion promise, events, progress, and supported controls.

## Route Definition

A route definition maps a framework page file to a URL template.
Configure `routeDefinitions` to provide page files and route names.
Dynamic templates require concrete URLs from a sitemap, crawler, or explicit URL list.

## Auditor

An auditor produces measurements and reports for one URL and device.
The local auditor runs Lighthouse through Chrome.
Other supported backends include PageSpeed Insights, CrUX, and DataForSEO.

## Seed Source

A seed source supplies initial URLs for a scan.
The host combines configured URLs, sitemap URLs, and route definitions.

## Storage

Storage holds scan records, route records, and report blobs.
A route result belongs to a scan, URL, and device.

## Reconciled Report

The reconciled report exposes a stable subset of Lighthouse metrics and audit findings.
Read the raw Lighthouse blob when you need fields outside that subset.

## Hook

A hook subscribes to a typed runtime event through `host.hooks`.
Adapter-specific events remain on their adapter.
