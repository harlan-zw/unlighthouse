---
title: "Improving Lighthouse Accuracy"
description: "Optimize Lighthouse scan accuracy with multiple samples and reduced concurrency for more reliable, consistent Core Web Vitals results."
keywords:
  - lighthouse accuracy
  - lighthouse score variability
  - lighthouse consistent results
  - lighthouse multiple runs
  - core web vitals accuracy
  - lighthouse reliable scores
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

Lighthouse scores can vary 5-10 points between runs due to network conditions, CPU load, and browser state. These techniques improve consistency for reliable [Core Web Vitals](/glossary) measurement.

## Why Scores Vary

Single Lighthouse runs can fluctuate by 5-10 points due to:
- CPU load from other browser tabs or processes
- Network latency variations
- Memory pressure
- Background service workers

For reliable performance monitoring, use multiple samples.

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

::tip
Use `samples: 3` for development, `samples: 5` for CI/production audits.
::

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

## Enable Throttling

Network throttling simulates real-world conditions and reduces score variability:

```ts
export default defineUnlighthouseConfig({
  scanner: {
    throttle: true, // Simulate 4G network
  },
})
```

## Recommended Production Config

For the most accurate results:

```ts
export default defineUnlighthouseConfig({
  scanner: {
    samples: 5,
    throttle: true,
  },
  puppeteerClusterOptions: {
    maxConcurrency: 1,
  },
})
```

::warning
Higher accuracy increases scan time significantly. Balance accuracy needs with scan duration.
::
