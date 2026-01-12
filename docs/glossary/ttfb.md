---
title: "What is Time to First Byte (TTFB)?"
description: "Learn what Time to First Byte measures, its thresholds, and how to optimize server response time for faster page loads."
keywords:
  - what is time to first byte
  - ttfb meaning
  - time to first byte explained
  - ttfb optimization
  - server response time
navigation:
  title: "TTFB"
relatedPages:
  - path: /glossary/fcp
    title: First Contentful Paint (FCP)
  - path: /glossary/lcp
    title: Largest Contentful Paint (LCP)
  - path: /guide/recipes/improving-accuracy
    title: Improving Accuracy
---

Time to First Byte (TTFB) measures how long it takes for the browser to receive the first byte of response from the server. It's a foundational metric that affects all other loading performance metrics.

## What TTFB Measures

TTFB captures the total time for these phases:

- **Redirect time** - Processing any HTTP redirects
- **Service worker startup** - If applicable
- **DNS lookup** - Resolving the domain name
- **Connection setup** - TCP handshake
- **TLS negotiation** - SSL/HTTPS handshake
- **Request/response** - Time until first response byte arrives

A high TTFB delays everything downstream: [FCP](/glossary/fcp), [LCP](/glossary/lcp), and full page load.

## TTFB Score Thresholds

| Score | Rating |
|-------|--------|
| ≤ 800ms | Good |
| 800ms - 1800ms | Needs Improvement |
| > 1800ms | Poor |

[Google recommends](https://web.dev/articles/ttfb) a TTFB of 800 milliseconds or less.

## Why TTFB Matters

TTFB is the starting point for all other metrics. Nothing can render until the browser receives that first byte. For SPAs that rely on JavaScript rendering, fast TTFB is especially critical since client-side rendering adds additional time on top.

Impact of slow TTFB:
- Delays all subsequent loading metrics
- Extends time to first render
- Hurts perceived performance
- Can indicate server or infrastructure problems

## Common TTFB Issues

**Slow server processing** - Complex database queries, unoptimized code, or insufficient server resources.

**No caching** - Regenerating responses that could be cached.

**Geographic distance** - Server far from users without CDN.

**DNS resolution** - Slow or unreliable DNS provider.

**Too many redirects** - Each redirect adds a full round-trip.

**Missing HTTP/2 or HTTP/3** - Older protocols have more overhead.

## How to Measure TTFB

Use [Unlighthouse](/guide/getting-started/unlighthouse-cli) to audit TTFB across your entire site.

For individual pages:
- Chrome DevTools Network panel (look for "Waiting for server response")
- [PageSpeed Insights](https://pagespeed.web.dev/) - Shows TTFB in field data
- WebPageTest for detailed waterfall analysis

### Measure in Browser

Run this in your browser console to see TTFB with sub-part breakdown. Based on [webperf-snippets](https://webperf-snippets.nucliweb.net/Loading/TTFB).

```ts
type Rating = 'good' | 'needs-improvement' | 'poor'

const rateValue = (ms: number): Rating =>
  ms <= 800 ? 'good' : ms <= 1800 ? 'needs-improvement' : 'poor'

new PerformanceObserver((list) => {
  const nav = list.getEntriesByType('navigation')[0] as PerformanceNavigationTiming
  const ttfb = nav.responseStart

  const rating = rateValue(ttfb)
  console.log(`TTFB: ${ttfb.toFixed(0)}ms (${rating})`)

  // Sub-parts breakdown
  console.log('Breakdown:')
  console.log(`  DNS: ${(nav.domainLookupEnd - nav.domainLookupStart).toFixed(0)}ms`)
  console.log(`  TCP: ${(nav.connectEnd - nav.connectStart).toFixed(0)}ms`)
  console.log(`  SSL: ${(nav.connectEnd - (nav.secureConnectionStart || nav.connectStart)).toFixed(0)}ms`)
  console.log(`  Server: ${(nav.responseStart - nav.requestStart).toFixed(0)}ms`)
}).observe({ type: 'navigation', buffered: true })
```

## Improving TTFB

Key optimization strategies:

1. **Use a CDN** - Serve content from edge locations closer to users
2. **Enable caching** - Cache responses at CDN, server, and application levels
3. **Optimize server code** - Profile and fix slow database queries, inefficient code
4. **Upgrade hosting** - More CPU, memory, or faster infrastructure
5. **Use HTTP/2 or HTTP/3** - Modern protocols reduce connection overhead
6. **Minimize redirects** - Each redirect adds a full round-trip
7. **Optimize DNS** - Use a fast, reliable DNS provider
8. **Preconnect to origins** - `<link rel="preconnect">` for known third-party domains

::note
TTFB is not a Core Web Vital, but it directly impacts [LCP](/glossary/lcp) which is. A slow TTFB makes it nearly impossible to achieve good LCP scores.
::

## TTFB Sub-Parts

When debugging slow TTFB, identify which phase is the bottleneck:

| Phase | Optimization |
|-------|--------------|
| DNS Lookup | Use faster DNS, enable DNS prefetching |
| TCP Connection | Enable HTTP/2+, use CDN |
| TLS Negotiation | Enable TLS 1.3, session resumption |
| Server Response | Optimize backend, add caching |
