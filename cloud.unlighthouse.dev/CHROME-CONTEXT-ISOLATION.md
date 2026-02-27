# Chrome Context Isolation Issue

## The Problem with Current Chrome Pool Implementation

The current Chrome pool implementation (`chrome-pool.ts`) has a **context isolation issue** that can affect scan accuracy.

### What's Happening

The pool reuses Chrome **processes** across multiple scans without properly isolating **browser contexts**. This means:

1. **Shared State Between Scans:**
   - Cookies persist across different URLs
   - LocalStorage/SessionStorage contamination
   - Service Workers may interfere
   - Cache affects subsequent scans
   - Browser history carries over

2. **Inaccurate Metrics:**
   - Performance metrics affected by cached resources
   - Security audits may miss issues due to existing cookies
   - PWA audits affected by service workers from previous scans

### Example Scenario

```typescript
// Scan 1: example.com sets cookies and caches resources
scan({ url: 'https://example.com' })

// Scan 2: Different site, but still has example.com's cookies!
scan({ url: 'https://different-site.com' })
// ❌ Metrics are contaminated by previous scan's state
```

## The Correct Approach

### Option 1: Browser Contexts (Puppeteer)

Use Puppeteer's `browser.createIncognitoBrowserContext()` to create isolated contexts:

```typescript
// Each scan gets a fresh context
const context = await browser.createIncognitoBrowserContext()
const page = await context.newPage()

// Run Lighthouse with this page
await lighthouse(url, { port, ... })

// Clean up
await context.close() // Destroys all state
```

**Benefits:**
- ✅ Complete isolation between scans
- ✅ Reuse Chrome process (faster than full restart)
- ✅ Automatic cleanup of state
- ✅ No memory leaks

### Option 2: Kill and Restart Chrome

Restart Chrome between scans (current self-hosted approach in `lighthouse.ts`):

```typescript
// Each scan gets a fresh Chrome process
const chrome = await chromeLauncher.launch()
await lighthouse(url, { port: chrome.port })
await chrome.kill()
```

**Trade-offs:**
- ✅ Perfect isolation
- ❌ Slower (5-10s overhead per scan)
- ❌ More resource intensive
- ❌ Requires careful cleanup

### Option 3: Use Browserless (Recommended)

Let Browserless handle all isolation and lifecycle:

```typescript
// Browserless manages contexts automatically
const result = await $fetch('https://chrome.browserless.io/performance', {
  body: { url, config }
})
```

**Benefits:**
- ✅ Proper context isolation guaranteed
- ✅ No management overhead
- ✅ Battle-tested implementation
- ✅ Automatic cleanup

## Why This Matters for Lighthouse

Lighthouse measures **real-world** performance, which means:

1. **Cold vs Warm Cache:**
   - First scan: Cold cache (realistic)
   - Second scan: Warm cache (unrealistic, better metrics)
   - Result: Inconsistent scores

2. **Cookie Impact:**
   - Authentication state may persist
   - Tracking cookies affect network requests
   - Different users get different experiences

3. **Service Worker Impact:**
   - PWA features from previous scan interfere
   - Offline capabilities affect metrics
   - Cache strategies contaminate results

## Current Implementation Status

### ❌ Chrome Pool (chrome-pool.ts)
**Status:** Context isolation not implemented

**Issue:** Reuses Chrome process without clearing contexts

**Impact:** Medium - Can cause contamination between scans

**Solution:** Needs browser context isolation added

### ✅ Direct Lighthouse (lighthouse.ts)
**Status:** Properly isolated

**Why:** Kills Chrome after each scan, ensuring fresh state

**Impact:** None - Scans are accurate but slower

### ✅ Browserless (lighthouse-browserless.ts)
**Status:** Properly isolated

**Why:** Browserless handles context isolation internally

**Impact:** None - Scans are accurate and fast

## Recommendation

For the **cloud.unlighthouse.dev** API:

### Short Term
Keep both implementations:
- `/api/scan` - Current approach (kill/restart Chrome) - Slower but accurate
- `/api/scan-browserless` - Browserless (recommended) - Fast and accurate

### Long Term
**Use Browserless** for production to avoid:
- Context isolation complexity
- Memory management issues
- Resource cleanup problems
- Lifecycle management overhead

## Fixing Chrome Pool (If Needed)

If you want to fix the chrome-pool implementation:

```typescript
// Modified chrome-pool.ts
export class ChromePool {
  async acquire(): Promise<{ chrome: Chrome, context: BrowserContext }> {
    const chrome = await this.getOrCreateChrome()

    // Create isolated context for each scan
    const browser = await puppeteer.connect({
      browserURL: `http://localhost:${chrome.port}`
    })
    const context = await browser.createIncognitoBrowserContext()

    return { chrome, context }
  }

  release({ chrome, context }: AcquiredInstance): void {
    // Clean up context
    await context.close()

    // Return Chrome to pool (keep alive)
    this.returnToPool(chrome)
  }
}
```

This requires:
1. Adding Puppeteer dependency
2. Managing both Chrome process and browser contexts
3. Coordinating Puppeteer and Lighthouse
4. More complex error handling

**Verdict:** More complexity than it's worth. Use Browserless instead.

## Summary

| Approach | Isolation | Speed | Complexity | Recommended |
|----------|-----------|-------|------------|-------------|
| Current Pool | ❌ No | Fast | High | ❌ No |
| Kill/Restart | ✅ Yes | Slow | Medium | ⚠️ Okay |
| Pool + Contexts | ✅ Yes | Fast | Very High | ⚠️ Maybe |
| Browserless | ✅ Yes | Fast | Low | ✅ **Yes** |

**Conclusion:** For minimal infrastructure and maximum reliability, use **Browserless**.
