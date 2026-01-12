---
title: "Improving Accuracy"
description: "Optimize Lighthouse scan accuracy with multiple samples and reduced concurrency for more reliable results."
navigation:
  title: "Improving Accuracy"
relatedPages:
  - path: /guide/guides/config
    title: Configuration
  - path: /guide/guides/device
    title: Device Configuration
  - path: /glossary
    title: Core Web Vitals Glossary
---

Lighthouse scores vary between runs due to network conditions and CPU load. These techniques improve consistency.

## Multiple Samples Per URL

Run Lighthouse multiple times and average the results for better accuracy:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    samples: 3, // Run 3 scans per URL and average results
  },
})
```

## Reduce Parallel Scans

Limit concurrent workers to reduce CPU contention and improve score consistency:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  puppeteerClusterOptions: {
    maxConcurrency: 1, // Single worker for maximum accuracy
  },
})
```

::tip
Combine multiple samples with reduced concurrency for the most accurate results, though this will increase scan time.
::
