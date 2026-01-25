---
title: "What is Total Blocking Time (TBT)?"
description: "Learn what Total Blocking Time measures, its thresholds, and how to reduce main thread blocking for better interactivity."
keywords:
  - what is total blocking time
  - tbt meaning
  - total blocking time explained
  - tbt lighthouse
  - main thread blocking
navigation:
  title: "TBT"
relatedPages:
  - path: /glossary/inp
    title: Interaction to Next Paint (INP)
  - path: /glossary/fcp
    title: First Contentful Paint (FCP)
  - path: /guide/recipes/improving-accuracy
    title: Improving Accuracy
---

Total Blocking Time (TBT) measures the total time the main thread was blocked during page load. It's a critical Lighthouse metric that indicates how responsive a page will feel during the loading phase.

## What TBT Measures

TBT counts the "blocking" portion of all Long Tasks between [FCP](/glossary/fcp) and when the page becomes reliably interactive. A Long Task is any JavaScript task that runs for more than 50ms.

For each Long Task, only the time beyond 50ms counts toward TBT:

```
Task duration: 70ms → Blocking time: 20ms (70 - 50)
Task duration: 250ms → Blocking time: 200ms (250 - 50)
Task duration: 30ms → Blocking time: 0ms (under threshold)
```

While the main thread is blocked, the browser can't respond to user input like clicks or taps.

## TBT Score Thresholds

| Score | Rating |
|-------|--------|
| ≤ 200ms | Good |
| 200ms - 600ms | Needs Improvement |
| > 600ms | Poor |

Lighthouse tests on simulated mobile hardware. A TBT under 200ms indicates the page should feel responsive during load.

## TBT vs INP

TBT and [INP](/glossary/inp) both measure responsiveness, but differently:

| Metric | When | What | Type |
|--------|------|------|------|
| TBT | During load | Main thread blocking | Lab metric |
| INP | Throughout session | Actual interaction latency | Field metric |

TBT is a lab proxy for interactivity during load. INP measures real user interactions over time. Low TBT often correlates with good INP, but not always.

## Why TBT Matters

TBT has the highest weight in Lighthouse performance scoring at **30%**. It directly reflects whether users can interact with your page during load.

High TBT means:

- Clicks and taps are delayed or ignored
- Scrolling may feel janky
- Users think the page is frozen
- Poor Lighthouse performance score

## Common TBT Issues

**Large JavaScript bundles** - More code means more parsing and execution time.

**Unoptimized third-party scripts** - Analytics, ads, and widgets competing for main thread.

**Heavy frameworks** - Client-side rendering with large framework overhead.

**Synchronous operations** - Layout thrashing, forced reflows, blocking API calls.

**No code splitting** - Loading JavaScript that isn't needed for initial view.

## How to Measure TBT

Use [Unlighthouse](/guide/getting-started/unlighthouse-cli) to measure TBT across your entire site.

For individual pages:

- Lighthouse in Chrome DevTools
- [PageSpeed Insights](https://pagespeed.web.dev/) - Lab data section
- WebPageTest

### Measure in Browser

Run this in your browser console to track Long Tasks that contribute to TBT.

```ts
let tbt = 0
let taskCount = 0

const observer = new PerformanceObserver((list) => {
  for (const entry of list.getEntries()) {
    // Only the blocking portion (time over 50ms) counts
    const blockingTime = entry.duration - 50
    if (blockingTime > 0) {
      tbt += blockingTime
      taskCount++
      console.log(`Long Task: ${entry.duration.toFixed(0)}ms (blocking: ${blockingTime.toFixed(0)}ms)`)
    }
  }
})

observer.observe({ type: 'longtask', buffered: true })

// Check total TBT anytime
function getTBT() {
  const rating = tbt <= 200 ? 'good' : tbt <= 600 ? 'needs-improvement' : 'poor'
  console.log(`TBT: ${tbt.toFixed(0)}ms from ${taskCount} long tasks (${rating})`)
  return tbt
}

console.log('TBT tracking active. Call getTBT() to see current total.')
```

## Improving TBT

Key optimization strategies:

1. **Break up Long Tasks** - Split large functions using `setTimeout`, `requestIdleCallback`, or `scheduler.yield()`
2. **Reduce JavaScript** - Remove unused code, tree-shake dependencies
3. **Code split** - Load only what's needed for initial view
4. **Defer third-party scripts** - Load analytics and ads after critical content
5. **Use web workers** - Move heavy computation off the main thread
6. **Optimize CSS** - Large stylesheets can block the main thread during parsing

```ts
// Break up a long task
async function processLargeArray(items: Item[]) {
  for (const item of items) {
    processItem(item)
    // Yield to main thread periodically
    if (items.indexOf(item) % 100 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
  }
}
```

::warning
TBT is only measured in lab conditions. Real-world interactivity is measured by [INP](/glossary/inp). Optimize for both, but prioritize INP since it's a Core Web Vital and ranking factor.
::

## Lighthouse Weight

TBT has the largest impact on your Lighthouse Performance score:

| Metric | Weight |
|--------|--------|
| TBT | 30% |
| LCP | 25% |
| CLS | 25% |
| FCP | 10% |
| Speed Index | 10% |
