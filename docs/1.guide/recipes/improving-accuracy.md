---
title: "Improving Lighthouse Accuracy"
description: "Improving Lighthouse Accuracy for the Unlighthouse v1 beta."
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

CPU load and network conditions can change Lighthouse measurements between runs.
Use repeated audits and serial performance scans for more consistent results.

## Repeat each audit

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://example.com',
  scanner: { samples: 3, perfConcurrency: 'serial' },
})
```

`samples` accepts values from 1 to 10.
Unlighthouse retains the median run by performance score.
The retained metrics, report, and screenshot belong to that same audit.

## Protect performance measurements

Serial performance audits avoid competing for CPU within the audit pool.
Non-performance audits can still use parallel workers.
If you select `perfConcurrency: 'parallel'`, treat performance scores as contended measurements.
The local auditor reports `reliablePerfScores: false` for that mode.

## Control the environment

Close unrelated workloads before comparing local scans.
Keep the device and Lighthouse throttling profile consistent between comparisons.
CI and localhost defaults disable throttling unless you supply an explicit profile.
Use `lighthouseOptions.throttling` when you need a fixed profile.

Puppeteer cluster concurrency settings do not control the v1 auditor.
