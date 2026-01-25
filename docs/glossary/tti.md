---
title: "What is Time to Interactive (TTI)?"
description: "Learn what Time to Interactive measured, why it was deprecated in Lighthouse 10, and what metrics replaced it."
keywords:
  - what is time to interactive
  - tti meaning
  - time to interactive explained
  - tti deprecated
  - tti lighthouse
navigation:
  title: "TTI (Deprecated)"
relatedPages:
  - path: /glossary/tbt
    title: Total Blocking Time (TBT)
  - path: /glossary/inp
    title: Interaction to Next Paint (INP)
  - path: /guide/recipes/improving-accuracy
    title: Improving Accuracy
---

::warning
Time to Interactive (TTI) was **removed from Lighthouse 10** in February 2023. Use [TBT](/glossary/tbt) for lab measurement and [INP](/glossary/inp) for field measurement of interactivity.
::

Time to Interactive measured when a page became fully interactive. It was a Lighthouse metric from 2017-2023 before being deprecated due to measurement issues.

## What TTI Measured

TTI marked the point when:

- The page displayed useful content ([FCP](/glossary/fcp) fired)
- Event handlers registered for visible elements
- The page responded to interactions within 50ms

The metric identified a 5-second "quiet window" where no Long Tasks occurred and fewer than 2 network requests were in flight.

## Why TTI Was Deprecated

[Google removed TTI in Lighthouse 10](https://developer.chrome.com/blog/lighthouse-10-0) because:

**Overly sensitive to outliers** - A single late network request or Long Task could dramatically inflate TTI, even if the page felt interactive.

**Better alternatives exist** - [LCP](/glossary/lcp) and Speed Index better indicate when content feels loaded. [TBT](/glossary/tbt) measures main-thread availability more robustly.

**Poor correlation with real experience** - A page could have terrible TTI but still feel responsive to users, or vice versa.

**Field measurement issues** - TTI required long observation periods and was impractical to measure in real user monitoring.

## What Replaced TTI

### For Lab Testing

**[Total Blocking Time (TBT)](/glossary/tbt)** - Measures cumulative main thread blocking during load. More robust, less sensitive to outliers.

When TTI was removed, its 10% score weight shifted to [CLS](/glossary/cls), making the new Lighthouse weights:

| Metric | Weight |
|--------|--------|
| TBT | 30% |
| LCP | 25% |
| CLS | 25% |
| FCP | 10% |
| Speed Index | 10% |

### For Field Measurement

**[Interaction to Next Paint (INP)](/glossary/inp)** - Measures actual interaction responsiveness across the entire page lifecycle. Became a Core Web Vital in March 2024.

## TTI Thresholds (Historical)

When TTI was active, thresholds were:

| Score | Rating |
|-------|--------|
| ≤ 3.8s | Good |
| 3.8s - 7.3s | Needs Improvement |
| > 7.3s | Poor |

## Still Need TTI?

If you have legacy systems that rely on TTI:

- It's still available in Lighthouse JSON output with `score: 0`
- It's hidden from the HTML report
- Scripted access to the JSON value continues to work

However, you should migrate to TBT or INP for meaningful interactivity measurement.

## Migration Guide

| Old Approach | New Approach |
|--------------|--------------|
| TTI in Lighthouse | Use [TBT](/glossary/tbt) (30% of score) |
| TTI in field/RUM | Use [INP](/glossary/inp) (Core Web Vital) |
| TTI CI assertions | Switch to TBT thresholds |

For most sites, the removal of TTI [improved Lighthouse scores](https://www.searchenginejournal.com/lighthouse-10-tti-removal/479789/) since pages typically score better on CLS than they did on TTI.

## Measuring Interactivity Today

Use [Unlighthouse](/guide/getting-started/unlighthouse-cli) to measure TBT across your site for lab data.

For real-user interactivity:

- Chrome User Experience Report (CrUX) for INP field data
- [PageSpeed Insights](https://pagespeed.web.dev/) shows both lab TBT and field INP
- Web Vitals library for custom RUM
