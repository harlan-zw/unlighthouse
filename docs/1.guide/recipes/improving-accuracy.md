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

# Improving Lighthouse Accuracy

Lighthouse scores can vary 5-10 points between runs due to network conditions, CPU load, and browser state. These techniques improve consistency for reliable [Core Web Vitals](/glossary) measurement.

## Why Scores Vary

Single Lighthouse runs can fluctuate by 5-10 points due to:
- CPU load from other browser tabs or processes
- Network latency variations
- Memory pressure
- Background service workers

For reliable performance monitoring, use multiple samples.

## Multiple Samples Per URL

Run Lighthouse multiple times per URL to smooth run-to-run variance. Unlighthouse keeps the **median run** (by performance score), not an average, so the stored report, metrics, and screenshot all come from one consistent audit:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    samples: 3, // Audit each URL 3× and keep the median run (max 10)
  },
})
```

::tip
Use `samples: 3` for development, `samples: 5` for CI/production audits.
::

::warning
Samples do not fix CPU contention. Running many audits in parallel contends for CPU, so every sample of a contended run is contaminated the same way, and the median converges on a contended median. See [Concurrency and perf scores](#concurrency-and-perf-scores) below.
::

## Concurrency and Perf Scores

Unlighthouse runs several audits in parallel (up to about half your CPU cores) to finish scans faster. Concurrent audits compete for CPU, which inflates timing-sensitive metrics (Total Blocking Time, Largest Contentful Paint, Speed Index). This is why lighthouse-ci runs serially.

By default, Unlighthouse protects perf scores from this: **performance audits run one at a time (a serial lane), while non-performance categories keep sweeping in parallel.** You get trustworthy perf scores without serializing the whole scan.

The behaviour is controlled by `scanner.perfConcurrency`:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  scanner: {
    // 'serial' (default): perf audits run one-at-a-time; scores stay trustworthy.
    // 'parallel': perf audits run concurrently for speed; scores are no longer
    //             reliable, and the report is flagged as such.
    perfConcurrency: 'serial',
  },
})
```

When you set `perfConcurrency: 'parallel'`, the local auditor reports `reliablePerfScores: false`: it will never claim contended perf scores are trustworthy. Use `parallel` only when you care about accessibility/SEO/best-practices coverage and treat perf numbers as indicative.

::tip
Pair `perfConcurrency: 'serial'` with the category-split auditor to run accessibility, SEO, and best-practices in parallel while performance sweeps serially, getting a fast scan and trustworthy perf scores at once.
::

Each stored report records the effective concurrency it ran under (`provenance.concurrency`), so historical rows stay interpretable: a value of `1` means the audit ran uncontended.

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
