---
title: "Dashboard and Export Customization"
description: "Dashboard and Export Customization for the Unlighthouse v1 beta."
navigation:
  title: "UI Customization"
relatedPages:
  - path: /api-doc/glossary
    title: Glossary
  - path: /guide/guides/config
    title: Configuration
  - path: /guide/guides/generating-static-reports
    title: Static Reports
---

The v1 dashboard uses built-in views backed by scan storage.
Legacy dashboard column components and `afterBuild` config hooks do not customize those views.

## Export a static dashboard

```sh
pnpm exec unlighthouse-ci --site https://example.com --build-static --reporter json
```

For scripts, call `host.generateClient({ static: true })` after the scan completes.
See [API Reference](/api-doc#read-reports-and-export-the-dashboard).

## Expanded CSV columns

`ci.reporterConfig.columns` configures expanded CSV exports.
Each category contains an array of column definitions with a label and audit key.
`client.columns` remains an export fallback when explicit reporter columns are absent.
It does not change the v1 dashboard.

Use [CI Integration](/integrations/ci) for report formats and filenames.
