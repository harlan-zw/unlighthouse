---
title: "Integration Deprecations"
icon: carbon:warning-alt
description: "Build tool integrations are deprecated in v1.0. Learn about migration paths and alternatives."
navigation: false
---

## Introduction

The following build tool integrations are deprecated and will be removed in v1.0:

- `@unlighthouse/nuxt`
- `@unlighthouse/vite`
- `@unlighthouse/webpack`

::warning
Start migrating to [CLI](/integrations/cli) or [CI](/integrations/ci) integrations for continued support.
::

## Background

When Unlighthouse was being developed, the goal was to make it as simple as possible to use with your development site.

To allow for this,
integrations
where added that set up Unlighthouse automatically for you.

This provided the site URL, automatic rescans on page updates and route discovery, which allowed for smarter sampling of dynamic routes.

## Why Deprecate?

Simply, the integrations are too difficult to maintain, error-prone and provide low-value.

In nearly all raised issues related to integration, they weren't needed and the CLI could be used instead.

## Upgrading

You should remove any of the following packages from your project.

- `@unlighthouse/nuxt`
- `@unlighthouse/vite`
- `@unlighthouse/webpack`

Instead, you should simply use the CLI.

```bash
npx unlighthouse --site localhost:3000
```

The HMR integration be solved by manually rescanning routes using the UI.

The route discovery
will still work when scanned in the root directory or an app with `pages`.
