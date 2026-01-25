---
title: "What is First Contentful Paint (FCP)?"
description: "Learn what First Contentful Paint measures, its thresholds, and how to improve FCP for better perceived load speed."
keywords:
  - what is first contentful paint
  - fcp meaning
  - first contentful paint explained
  - fcp lighthouse
navigation:
  title: "FCP"
relatedPages:
  - path: /glossary/lcp
    title: Largest Contentful Paint (LCP)
  - path: /glossary/ttfb
    title: Time to First Byte (TTFB)
  - path: /guide/recipes/improving-accuracy
    title: Improving Accuracy
---

First Contentful Paint (FCP) measures the time from navigation start to when any content first renders on screen. It's a Lighthouse performance metric that indicates when users first see something happening.

## What FCP Measures

FCP tracks when the browser renders the first piece of DOM content. This includes:

- Text (any font rendering)
- Images (including background images)
- SVG elements
- Non-white canvas elements

The timer starts when the user initiates navigation and stops at the first content render. This includes time spent on redirects, DNS lookup, connection setup, and TTFB.

## FCP Score Thresholds

| Score | Rating |
|-------|--------|
| ≤ 1.8s | Good |
| 1.8s - 3.0s | Needs Improvement |
| > 3.0s | Poor |

[Google recommends](https://web.dev/articles/fcp) an FCP of 1.8 seconds or less for at least 75% of page visits.

## FCP vs LCP

FCP and [LCP](/glossary/lcp) measure different moments:

| Metric | Measures | Answers |
|--------|----------|---------|
| FCP | First content render | "Is anything happening?" |
| LCP | Largest content render | "Is the main content loaded?" |

A page can have fast FCP (spinner appears quickly) but slow LCP (actual content takes longer). Both matter for user experience.

## Why FCP Matters

FCP marks when users perceive the page is loading. Before FCP, users see a blank screen and may assume the page is broken or slow.

A fast FCP:

- Reassures users something is happening
- Reduces perceived wait time
- Lowers early abandonment
- Contributes to overall Lighthouse score (10% weight)

## Common FCP Issues

**Slow server response** - High [TTFB](/glossary/ttfb) delays everything, including FCP.

**Render-blocking resources** - CSS and synchronous JavaScript in `<head>` block first paint.

**Large CSS files** - Browser must parse all CSS before rendering any content.

**Web font loading** - Text may be invisible until fonts download if using `font-display: block`.

**Too many redirects** - Each redirect adds network round-trips before content can load.

## How to Measure FCP

Use [Unlighthouse](/guide/getting-started/unlighthouse-cli) to measure FCP across your entire site.

For individual pages:

- Chrome DevTools Performance panel
- Lighthouse in Chrome
- [PageSpeed Insights](https://pagespeed.web.dev/)
- Web Vitals Chrome extension

### Measure in Browser

Run this in your browser console to see FCP timing.

```ts
type Rating = 'good' | 'needs-improvement' | 'poor'

function rateValue(ms: number): Rating {
  return ms <= 1800 ? 'good' : ms <= 3000 ? 'needs-improvement' : 'poor'
}

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    if (entry.name === 'first-contentful-paint') {
      const rating = rateValue(entry.startTime)
      console.log(`FCP: ${(entry.startTime / 1000).toFixed(2)}s (${rating})`)
    }
  }
})

observer.observe({ type: 'paint', buffered: true })
```

## Improving FCP

Key optimization strategies:

1. **Reduce server response time** - Optimize [TTFB](/glossary/ttfb) with caching and CDNs
2. **Eliminate render-blocking resources** - Defer non-critical CSS/JS, inline critical CSS
3. **Minify CSS** - Remove unused styles and compress what remains
4. **Preconnect to origins** - Use `<link rel="preconnect">` for third-party domains
5. **Avoid redirects** - Each redirect adds latency
6. **Optimize font loading** - Use `font-display: swap` or `optional`

::note
FCP is a Lighthouse lab metric, not a Core Web Vital. However, improving FCP typically improves [LCP](/glossary/lcp), which is a Core Web Vital and ranking factor.
::
