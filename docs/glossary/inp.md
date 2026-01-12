---
title: "What is Interaction to Next Paint (INP)?"
description: "Learn what Interaction to Next Paint means, why it replaced FID as a Core Web Vital, and how to improve your site's responsiveness."
keywords:
  - what is interaction to next paint
  - inp meaning
  - interaction to next paint explained
  - inp core web vitals
  - inp vs fid
navigation:
  title: "INP"
relatedPages:
  - path: /glossary/lcp
    title: Largest Contentful Paint (LCP)
  - path: /glossary/cls
    title: Cumulative Layout Shift (CLS)
  - path: /guide/recipes/improving-accuracy
    title: Improving Accuracy
---

Interaction to Next Paint (INP) measures how quickly your page responds to user interactions. It [replaced First Input Delay (FID)](https://web.dev/blog/inp-cwv-march-12) as a [Core Web Vital](/glossary/) in March 2024 and is now a Google ranking factor.

## What INP Measures

INP tracks the latency of all clicks, taps, and keyboard interactions throughout a page's lifecycle, then reports a value representative of the overall experience (typically the worst interaction, with some outlier handling).

The measurement includes:
- **Input delay** - Time from interaction to event handler start
- **Processing time** - Time to run event handlers
- **Presentation delay** - Time to render the next frame

## INP Score Thresholds

| Score | Rating |
|-------|--------|
| ≤ 200ms | Good |
| 200ms - 500ms | Needs Improvement |
| > 500ms | Poor |

[Google recommends](https://web.dev/articles/inp) an INP of 200 milliseconds or less for at least 75% of page visits.

## INP vs FID

FID only measured the *first* interaction's input delay—ignoring processing and presentation time entirely. A page could have great FID but terrible responsiveness afterward.

INP is more comprehensive:
- Measures *all* interactions, not just the first
- Includes the full interaction lifecycle
- Better represents actual user experience

## Why INP Matters

Users expect instant feedback. When they click a button and nothing happens for 500ms, they assume it's broken and click again—or leave.

Good INP means:
- Responsive, fluid interactions
- Users trust the interface works
- Lower frustration and abandonment
- Better search rankings

## Common INP Issues

**Long JavaScript tasks** - Any task over 50ms blocks the main thread and delays interactions.

**Heavy event handlers** - Click handlers that do too much work before updating the UI.

**Hydration delays** - SPAs that look interactive but aren't until JavaScript loads.

**Third-party scripts** - Analytics, ads, and widgets competing for main thread time.

**Large DOM size** - More elements mean slower style recalculation and layout.

## How to Measure INP

[Unlighthouse](/guide/getting-started/unlighthouse-cli) reports responsiveness metrics across your site. For INP specifically, you need field data since it measures real user interactions.

Measurement tools:
- Chrome User Experience Report (CrUX) - Real user data
- Web Vitals Chrome extension - Your own interactions
- [PageSpeed Insights](https://pagespeed.web.dev/) - Field data section
- Performance panel in DevTools - Interaction traces

### Measure in Browser

Run this in your browser console to track INP as you interact with the page.

```ts
type Rating = 'good' | 'needs-improvement' | 'poor'

const rateValue = (ms: number): Rating =>
  ms <= 200 ? 'good' : ms <= 500 ? 'needs-improvement' : 'poor'

let worstInp = 0

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries() as (PerformanceEntry & {
    duration: number
    interactionId: number
    name: string
  })[]) {
    // Only track actual interactions (has interactionId)
    if (!entry.interactionId) continue

    if (entry.duration > worstInp) {
      worstInp = entry.duration
      const rating = rateValue(worstInp)
      console.log(`INP: ${worstInp}ms (${rating}) - ${entry.name}`)
    }
  }
})

observer.observe({ type: 'event', buffered: true, durationThreshold: 16 })

console.log('INP tracking active. Interact with the page to measure.')
```

::note
Lab tools like Lighthouse can't fully measure INP because it requires real user interactions over time. Use field data for accurate INP scores.
::

## Improving INP

Key optimization strategies:

1. **Break up long tasks** - Use `setTimeout` or `scheduler.yield()` to yield to the main thread
2. **Defer non-critical work** - Move analytics and non-essential code out of interaction handlers
3. **Use web workers** - Offload heavy computation off the main thread
4. **Optimize event handlers** - Do the minimum work needed, then update UI
5. **Reduce DOM size** - Fewer elements mean faster rendering
6. **Debounce rapid interactions** - Avoid processing every keystroke

```js
// Yield to main thread during long tasks
async function processItems(items) {
  for (const item of items) {
    process(item)
    // Let browser handle pending interactions
    await scheduler.yield()
  }
}
```

