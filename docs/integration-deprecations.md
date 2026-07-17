---
title: "Removed Build Tool Integrations"
icon: carbon:warning-alt
description: "Build tool integrations were removed in v1. Learn how to migrate to the CLI or CI runner."
keywords:
  - unlighthouse migration
  - unlighthouse upgrade
  - unlighthouse deprecated
  - unlighthouse breaking changes
navigation: false
relatedPages:
  - path: /integrations/cli
    title: CLI Integration
  - path: /integrations/ci
    title: CI Integration
  - path: /guide/guides/config
    title: Configuration
---

# Removed Build Tool Integrations

The following build tool integrations were removed in v1:

- `@unlighthouse/nuxt`
- `@unlighthouse/vite`
- `@unlighthouse/webpack`

::warning
Use the [CLI](/integrations/cli) or [CI](/integrations/ci) runner for continued support.
::

## Background

The original integrations embedded Unlighthouse in development servers to
provide a site URL, automatic rescans, and framework-specific route discovery.

## Why Deprecate?

They coupled Unlighthouse releases to several build-tool lifecycles while
duplicating behavior already available through the CLI. That maintenance cost
was not justified by the small convenience layer.

## Upgrading

You should remove any of the following packages from your project.

- `@unlighthouse/nuxt`
- `@unlighthouse/vite`
- `@unlighthouse/webpack`

Run the interactive CLI against an already-running local server:

```bash
npx unlighthouse --site http://localhost:3000
```

For automation, run the CI command against a deployed preview URL or a preview
server started by an earlier job step:

```bash
npx unlighthouse-ci --site https://preview.example.com
```

Use the dashboard to rescan routes during development. For file-based route
discovery, configure [route definitions](/guide/guides/route-definitions) in
`unlighthouse.config.ts`.
