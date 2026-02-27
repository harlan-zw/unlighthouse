---
title: "Speed Index: What It Is, Good Scores & How to Improve"
description: "Speed Index measures how fast visible content fills the viewport. Good score: ≤3.4s mobile, ≤1.3s desktop. 10% of Lighthouse performance score. Learn thresholds and fixes."
keywords:
  - what is speed index
  - speed index meaning
  - speed index explained
  - speed index lighthouse
  - visual loading speed
  - speed index good score
  - speed index threshold
  - speed index test
  - improve speed index
  - lighthouse speed index
navigation:
  title: "Speed Index"
relatedPages:
  - path: /glossary/fcp
    title: First Contentful Paint (FCP)
  - path: /glossary/lcp
    title: Largest Contentful Paint (LCP)
  - path: /guide/recipes/improving-accuracy
    title: Improving Accuracy
  - path: /tools/lighthouse-score-calculator
    title: Lighthouse Score Calculator
---

Speed Index measures how quickly visible content populates the viewport during page load. It captures the overall visual loading experience rather than a single moment in time.

## What Speed Index Measures

Speed Index analyzes a video of the page loading and calculates how quickly the viewport fills with content. It considers the visual progression between frames:

- A page that renders 80% of content instantly then slowly loads the rest scores better than
- A page that loads content evenly over time

Lower scores are better. A page that shows all content immediately has a Speed Index of 0.

## Speed Index Thresholds

### Mobile

| Score | Rating |
|-------|--------|
| ≤ 3.4s | Good |
| 3.4s - 5.8s | Needs Improvement |
| > 5.8s | Poor |

### Desktop

| Score | Rating |
|-------|--------|
| ≤ 1.3s | Good |
| 1.3s - 2.3s | Needs Improvement |
| > 2.3s | Poor |

Desktop thresholds are lower because desktop connections are typically faster.

## How Speed Index Works

Lighthouse captures video frames during page load and uses the [Speedline](https://github.com/paulirish/speedline) library to:

1. Calculate visual completeness at each frame
2. Compute the area under the visual progress curve
3. Generate a score in milliseconds

The score represents the average time at which visible parts of the page are displayed.

## Why Speed Index Matters

Speed Index reflects perceived load speed better than single-moment metrics. A page might have fast [FCP](/glossary/fcp) but still feel slow if subsequent content takes long to appear.

Good Speed Index means:

- Users see content appearing quickly
- Reduced perceived wait time
- Better visual loading experience
- Contributes 10% to Lighthouse score

## Speed Index vs Other Metrics

| Metric | Measures | Single point vs Range |
|--------|----------|----------------------|
| [FCP](/glossary/fcp) | First content appears | Single moment |
| [LCP](/glossary/lcp) | Largest content appears | Single moment |
| Speed Index | Overall visual progress | Range (area under curve) |

Speed Index complements FCP and LCP by measuring the experience between these points.

## Common Speed Index Issues

**Render-blocking resources** - CSS and JavaScript that delay initial rendering.

**Large images above the fold** - Unoptimized hero images that load slowly.

**Web font loading** - FOIT (Flash of Invisible Text) delays text rendering.

**Client-side rendering** - JavaScript frameworks that render content after load.

**Third-party embeds** - Social widgets and ads that load in the viewport.

## How to Measure Speed Index

Use [Unlighthouse](/guide/getting-started/unlighthouse-cli) to measure Speed Index across your entire site.

For individual pages:

- Lighthouse in Chrome DevTools
- [PageSpeed Insights](https://pagespeed.web.dev/)
- WebPageTest (original source of the metric)

::note
Speed Index can't be measured with JavaScript in the browser. It requires video capture and frame-by-frame analysis, which only lab tools like Lighthouse can perform.
::

## Improving Speed Index

Key optimization strategies from [Chrome DevTools documentation](https://developer.chrome.com/docs/lighthouse/performance/speed-index):

1. **Minimize main thread work** - Reduce JavaScript execution during load
2. **Reduce JavaScript execution time** - Optimize and split code
3. **Ensure text remains visible during webfont load** - Use `font-display: swap`

Additional strategies:

1. **Optimize critical rendering path** - Inline critical CSS, defer non-critical
2. **Optimize images** - Compress, use modern formats (WebP, AVIF), lazy-load below fold
3. **Prioritize visible content** - Load above-the-fold content first
4. **Use SSR or SSG** - Server-render initial content instead of client-side rendering

## Lighthouse Weight

Speed Index contributes 10% to the overall Lighthouse Performance score:

| Metric | Weight |
|--------|--------|
| [TBT](/glossary/tbt) | 30% |
| [LCP](/glossary/lcp) | 25% |
| [CLS](/glossary/cls) | 25% |
| [FCP](/glossary/fcp) | 10% |
| Speed Index | 10% |

::note
Speed Index is a lab metric, not a Core Web Vital. Focus on [LCP](/glossary/lcp), [CLS](/glossary/cls), and [INP](/glossary/inp) for search ranking impact.
::
