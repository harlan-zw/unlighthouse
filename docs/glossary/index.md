---
title: "Web Performance Glossary"
description: "Definitions and explanations of Core Web Vitals, Lighthouse metrics, and web performance terminology."
keywords:
  - web performance glossary
  - core web vitals explained
  - lighthouse metrics
  - web vitals definitions
navigation:
  title: "Glossary"
relatedPages:
  - path: /guide/getting-started/unlighthouse-cli
    title: Unlighthouse CLI
  - path: /guide/recipes/improving-accuracy
    title: Improving Accuracy
  - path: /guide/guides/lighthouse
    title: Lighthouse Options
---

Quick reference for Core Web Vitals and web performance metrics. Each entry explains what the metric measures, why it matters, and how to improve it.

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

## Measuring Your Site

Use [Unlighthouse CLI](/guide/getting-started/unlighthouse-cli) to audit all these metrics across your entire website in a single scan:

```bash
npx unlighthouse --site https://example.com
```
