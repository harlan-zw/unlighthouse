---
title: "Customizing the UI"
description: "Modify Unlighthouse client interface columns and display to show custom metrics and data."
navigation:
  title: "UI Customization"
---

## Introduction

Unlighthouse's client interface can be customized to display the metrics most relevant to your needs. Modify columns, add custom data, and tailor the UI to your workflow.

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
See the [Column API Reference](/api/glossary/#columns) for all available column options.
::
