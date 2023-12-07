---
title: Modifying UI
description: How to modify the Unlighthouse UI.
---

## Changing columns

Unlighthouse was built to be hacked. That includes the columns used to display your lighthouse data.

You can customise the columns to show any aggregated data that is useful for you.

See the [glossary guide](/api/glossary/#columns) for the columns to understand the API.

### Example: Replace FCP Column with Server Response

```ts
export default {
  hooks: {
    'resolved-config': function (config) {
      // replace FCP column with server response time
      config.client.columns.performance[2] = {
        cols: 1,
        label: 'Response Time',
        tooltip: 'Time for the server to respond',
        sortKey: 'numericValue',
        key: 'report.audits.server-response-time',
      }
    }
  }
}
```

