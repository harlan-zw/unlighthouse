---
title: "What is Largest Contentful Paint (LCP)?"
description: "Learn what Largest Contentful Paint means, why it matters for Core Web Vitals, and how to measure and improve LCP scores."
keywords:
  - what is largest contentful paint
  - lcp meaning
  - largest contentful paint explained
  - lcp core web vitals
navigation:
  title: "LCP"
relatedPages:
  - path: /glossary/cls
    title: Cumulative Layout Shift (CLS)
  - path: /glossary/inp
    title: Interaction to Next Paint (INP)
  - path: /guide/recipes/improving-accuracy
    title: Improving Accuracy
---

Largest Contentful Paint (LCP) measures how long it takes for the largest visible content element to render on screen. It's one of Google's three [Core Web Vitals](/glossary/) and directly impacts your search rankings.

## What LCP Measures

LCP tracks the render time of the largest image, video, or text block visible in the viewport. Common LCP elements include:

- Hero images
- Featured video thumbnails
- Large heading text blocks
- Above-the-fold content images

The metric starts when the page begins loading and ends when the largest element finishes rendering.

## LCP Score Thresholds

| Score | Rating |
|-------|--------|
| ≤ 2.5s | Good |
| 2.5s - 4.0s | Needs Improvement |
| > 4.0s | Poor |

[Google recommends](https://web.dev/articles/lcp) achieving an LCP of 2.5 seconds or less for at least 75% of page visits.

## Why LCP Matters

LCP directly correlates with perceived load speed. Users don't care about technical metrics—they care about seeing content. A fast LCP means:

- Better user experience
- Lower bounce rates
- Higher search rankings (it's a ranking factor)
- Improved conversion rates

## Common LCP Issues

**Slow server response** - Time to First Byte (TTFB) delays everything downstream.

**Render-blocking resources** - CSS and JavaScript that block the main thread delay LCP elements.

**Unoptimized images** - Large, uncompressed images take longer to download and render.

**Client-side rendering** - SPAs that render content via JavaScript often have poor LCP.

## How to Measure LCP

Use [Unlighthouse](/guide/getting-started/unlighthouse-cli) to measure LCP across your entire site at once, rather than checking pages individually.

For individual page testing:

- Chrome DevTools Performance panel
- Lighthouse in Chrome
- [PageSpeed Insights](https://pagespeed.web.dev/)
- Chrome User Experience Report (CrUX) for field data

### Measure in Browser

Run this in your browser console to track LCP in real-time. Based on [webperf-snippets](https://webperf-snippets.nucliweb.net/CoreWebVitals/LCP).

```ts
type Rating = 'good' | 'needs-improvement' | 'poor'

function rateValue(ms: number): Rating {
  return ms <= 2500 ? 'good' : ms <= 4000 ? 'needs-improvement' : 'poor'
}

const observer = new PerformanceObserver((list) => {
  const entries = list.getEntries() as PerformanceEntry[]
  const lastEntry = entries.at(-1) as PerformanceEntry & {
    startTime: number
    element?: Element
    url?: string
    size?: number
  }
  if (!lastEntry)
    return

  const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
  const activationStart = navEntry?.activationStart || 0
  const lcpTime = Math.max(0, lastEntry.startTime - activationStart)
  const rating = rateValue(lcpTime)

  console.log(`LCP: ${(lcpTime / 1000).toFixed(2)}s (${rating})`)

  if (lastEntry.element) {
    console.log('LCP Element:', lastEntry.element)
    lastEntry.element.style.outline = '3px dashed lime'
  }
})

observer.observe({ type: 'largest-contentful-paint', buffered: true })
```

## Improving LCP

Key optimization strategies:

1. **Optimize your server** - Use caching, CDNs, and efficient backend code
2. **Preload critical resources** - Use `<link rel="preload">` for LCP images
3. **Compress images** - Use modern formats (WebP, AVIF) and proper sizing
4. **Remove render-blocking resources** - Defer non-critical CSS/JS
5. **Use SSR or SSG** - Avoid client-side rendering for above-the-fold content

::note
LCP is measured in the field (real users) and lab (synthetic tests). Field data from CrUX is what Google uses for rankings.
::
