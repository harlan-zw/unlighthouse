---
title: "Core Web Vitals Guide"
description: "Complete guide to Core Web Vitals and Lighthouse metrics. Learn what LCP, CLS, and INP measure, their impact on SEO, and how to improve them."
keywords:
  - core web vitals
  - core web vitals seo
  - what are core web vitals
  - lighthouse metrics
  - lighthouse core web vitals
  - web vitals guide
  - google core web vitals
  - core web vitals ranking factor
navigation:
  title: "Core Web Vitals"
relatedPages:
  - path: /guide/getting-started/unlighthouse-cli
    title: Unlighthouse CLI
  - path: /guide/recipes/improving-accuracy
    title: Improving Accuracy
  - path: /guide/guides/lighthouse
    title: Lighthouse Options
---

Core Web Vitals are Google's key metrics for user experience and are a direct ranking factor in search results. Understanding and optimizing these metrics improves both SEO and user experience.

## Core Web Vitals

Google's three key metrics that affect search rankings:

::card-group
  ::card{title="LCP" to="/glossary/lcp"}
  **Largest Contentful Paint** - Measures loading performance. How quickly does the main content appear?
  ::

  ::card{title="CLS" to="/glossary/cls"}
  **Cumulative Layout Shift** - Measures visual stability. Does content jump around unexpectedly?
  ::

  ::card{title="INP" to="/glossary/inp"}
  **Interaction to Next Paint** - Measures responsiveness. How quickly does the page respond to clicks?
  ::
::

## Lighthouse Performance Metrics

Additional metrics reported by Lighthouse that contribute to your performance score:

::card-group
  ::card{title="FCP" to="/glossary/fcp"}
  **First Contentful Paint** - When the first content renders. Is anything happening?
  ::

  ::card{title="TTFB" to="/glossary/ttfb"}
  **Time to First Byte** - Server response time. How fast is your backend?
  ::

  ::card{title="TBT" to="/glossary/tbt"}
  **Total Blocking Time** - Main thread blocking during load. 30% of Lighthouse score.
  ::

  ::card{title="Speed Index" to="/glossary/speed-index"}
  **Speed Index** - Visual loading progress. How quickly does content fill the viewport?
  ::
::

### Lighthouse Score Weights

| Metric | Weight | Type |
|--------|--------|------|
| [TBT](/glossary/tbt) | 30% | Lab |
| [LCP](/glossary/lcp) | 25% | Core Web Vital |
| [CLS](/glossary/cls) | 25% | Core Web Vital |
| [FCP](/glossary/fcp) | 10% | Lab |
| [Speed Index](/glossary/speed-index) | 10% | Lab |

### Deprecated Metrics

- [TTI (Time to Interactive)](/glossary/tti) - Removed in Lighthouse 10. Use [TBT](/glossary/tbt) or [INP](/glossary/inp) instead.

## Core Web Vitals and SEO

Since 2021, Core Web Vitals have been a Google ranking factor. Sites with good Core Web Vitals may rank higher in search results and appear in Google's "Top Stories" carousel.

Google measures Core Web Vitals from real user data (Chrome User Experience Report). Improving these metrics:
- Boosts search rankings
- Improves user engagement
- Reduces bounce rates
- Increases conversions

## Measuring Your Site

Use [Unlighthouse CLI](/guide/getting-started/unlighthouse-cli) to audit all these metrics across your entire website in a single scan:

```bash
npx unlighthouse --site https://example.com
```

Unlike single-page tools like PageSpeed Insights, Unlighthouse scans your entire site and identifies which pages need the most attention.
