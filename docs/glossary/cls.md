---
title: "What is Cumulative Layout Shift (CLS)?"
description: "Learn what Cumulative Layout Shift means, why it matters for Core Web Vitals, and how to prevent layout shifts on your website."
keywords:
  - what is cumulative layout shift
  - cls meaning
  - cumulative layout shift explained
  - cls core web vitals
  - layout shift
navigation:
  title: "CLS"
relatedPages:
  - path: /glossary/lcp
    title: Largest Contentful Paint (LCP)
  - path: /glossary/inp
    title: Interaction to Next Paint (INP)
  - path: /guide/recipes/improving-accuracy
    title: Improving Accuracy
---

Cumulative Layout Shift (CLS) measures visual stability—how much page content unexpectedly moves during loading. It's one of Google's three [Core Web Vitals](/glossary/) and affects both user experience and search rankings.

## What CLS Measures

CLS quantifies unexpected layout shifts that occur without user interaction. A layout shift happens when a visible element changes position from one rendered frame to the next.

The score is calculated by multiplying:
- **Impact fraction** - How much of the viewport was affected
- **Distance fraction** - How far the elements moved

Higher scores mean more disruptive shifts.

## CLS Score Thresholds

| Score | Rating |
|-------|--------|
| ≤ 0.1 | Good |
| 0.1 - 0.25 | Needs Improvement |
| > 0.25 | Poor |

[Google recommends](https://web.dev/articles/cls) a CLS score of 0.1 or less for at least 75% of page visits.

## Why CLS Matters

Layout shifts frustrate users. You've experienced it: reading an article when an ad loads and pushes content down, causing you to lose your place—or worse, clicking the wrong button.

Poor CLS leads to:
- Accidental clicks
- User frustration
- Lost trust and higher bounce rates
- Lower search rankings

## Common CLS Causes

**Images without dimensions** - When images load without width/height attributes, the browser doesn't know how much space to reserve.

**Ads and embeds** - Third-party content that injects itself into the page without reserved space.

**Web fonts** - Font swapping causes text to reflow when custom fonts load.

**Dynamically injected content** - JavaScript that inserts content above existing elements.

**Animations** - CSS animations that change element size or position.

## How to Measure CLS

Use [Unlighthouse](/guide/getting-started/unlighthouse-cli) to measure CLS across your entire site at once. This helps identify problematic pages quickly.

For individual page testing:
- Chrome DevTools Performance panel
- Lighthouse in Chrome
- [PageSpeed Insights](https://pagespeed.web.dev/)
- Web Vitals Chrome extension

### Measure in Browser

Run this in your browser console to track CLS in real-time. Based on [webperf-snippets](https://webperf-snippets.nucliweb.net/CoreWebVitals/CLS).

```ts
type Rating = 'good' | 'needs-improvement' | 'poor'

const rateValue = (score: number): Rating =>
  score <= 0.1 ? 'good' : score <= 0.25 ? 'needs-improvement' : 'poor'

let cls = 0

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean, value: number })[]) {
    // Only count shifts without recent user input
    if (!entry.hadRecentInput) {
      cls += entry.value
    }
  }
})

observer.observe({ type: 'layout-shift', buffered: true })

// Check current CLS anytime
const getCLS = () => {
  const rating = rateValue(cls)
  console.log(`CLS: ${cls.toFixed(4)} (${rating})`)
  return cls
}

// Log final CLS when user leaves page
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') {
    observer.takeRecords()
    getCLS()
  }
})

getCLS()
```

## Preventing Layout Shifts

Key strategies to maintain visual stability:

1. **Always set image dimensions** - Use `width` and `height` attributes or CSS aspect-ratio
2. **Reserve space for ads** - Use fixed containers for ad slots
3. **Preload fonts** - Use `font-display: optional` or preload critical fonts
4. **Avoid inserting content above existing content** - Add new elements below the fold or use transforms
5. **Use CSS transforms for animations** - Transform doesn't trigger layout recalculation

::tip
Use `aspect-ratio` CSS property for responsive images:
```css
img {
  aspect-ratio: 16 / 9;
  width: 100%;
  height: auto;
}
```
::

