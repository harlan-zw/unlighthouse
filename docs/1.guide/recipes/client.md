---
title: "Customizing the UI"
description: "Modify Unlighthouse client interface columns and display to show custom metrics and data."
keywords:
  - lighthouse dashboard
  - lighthouse ui
  - custom lighthouse metrics
  - lighthouse report customization
  - lighthouse custom columns
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

Customize the Unlighthouse dashboard to display metrics relevant to your workflow. Replace default columns, add custom audit displays, and configure how results appear.

## Customizing Columns

Replace or add columns to display specific Lighthouse metrics:

### Example: Replace FCP with Server Response Time

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  hooks: {
    'resolved-config': function (config) {
      config.client.columns.performance[2] = {
        cols: 1,
        label: 'Response Time',
        tooltip: 'Time for the server to respond',
        sortKey: 'numericValue',
        key: 'report.audits.server-response-time',
      }
    },
  },
})
```

::tip
See the [Column API Reference](/api-doc/glossary#columns) for all available column options.
::
