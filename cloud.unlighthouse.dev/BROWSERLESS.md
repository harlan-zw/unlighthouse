# Browserless Integration Option

This document explains how to use Browserless.io as a managed browser service instead of self-hosting Chrome instances.

## Why Browserless?

**Benefits:**
- ✅ Zero infrastructure management (no Chrome pools, no cleanup)
- ✅ Built-in Lighthouse API endpoint
- ✅ Automatic scaling and concurrency management
- ✅ Pay-per-use pricing (no idle resource costs)
- ✅ Better reliability and performance
- ✅ No memory leaks or resource cleanup issues

**vs Self-Hosted:**
- ❌ Self-hosted: Chrome instances, memory management, cleanup, monitoring
- ✅ Browserless: Single API call

## Architecture Comparison

### Current (Self-Hosted)
```
Request → Cache → Queue → Chrome Pool → Lighthouse → Response
                    ↓
              (Manage lifecycle, cleanup, monitoring)
```

### With Browserless
```
Request → Cache → Browserless API → Response
                    ↓
              (All managed externally)
```

## Implementation

### 1. Install Browserless Client

```bash
pnpm add @browserless/lighthouse
```

### 2. Update Service

```typescript
// server/app/services/lighthouse-browserless.ts
import type { LighthouseScanOptions, LighthouseScanResult } from './lighthouse'
import { createError, useRuntimeConfig } from '#imports'
import { $fetch } from 'ofetch'

export async function runLighthouseScanViaBrowserless(
  options: LighthouseScanOptions,
): Promise<LighthouseScanResult> {
  const config = useRuntimeConfig()
  const browserlessUrl = config.browserless.url || 'https://chrome.browserless.io'
  const browserlessToken = config.browserless.token

  if (!browserlessToken) {
    throw createError({
      statusCode: 500,
      statusMessage: 'Browserless token not configured',
    })
  }

  const categories = options.categories?.length
    ? options.categories
    : ['performance', 'accessibility', 'best-practices', 'seo']

  const lighthouseConfig = {
    extends: 'lighthouse:default',
    settings: {
      onlyCategories: categories,
      formFactor: options.formFactor || 'mobile',
      throttling: options.throttling === 'none'
        ? {
            rttMs: 0,
            throughputKbps: 0,
            requestLatencyMs: 0,
            downloadThroughputKbps: 0,
            uploadThroughputKbps: 0,
            cpuSlowdownMultiplier: 1,
          }
        : options.throttling === 'mobile3G'
          ? {
              rttMs: 300,
              throughputKbps: 700,
              requestLatencyMs: 1125,
              downloadThroughputKbps: 700,
              uploadThroughputKbps: 700,
              cpuSlowdownMultiplier: 4,
            }
          : undefined, // Use Lighthouse defaults for mobile4G
      screenEmulation: {
        mobile: options.formFactor === 'mobile',
        width: options.formFactor === 'mobile' ? 375 : 1350,
        height: options.formFactor === 'mobile' ? 667 : 940,
        deviceScaleFactor: options.formFactor === 'mobile' ? 2 : 1,
        disabled: false,
      },
    },
  }

  try {
    // Call Browserless /performance endpoint
    const response = await $fetch(`${browserlessUrl}/performance`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      query: {
        token: browserlessToken,
      },
      body: {
        url: options.url,
        config: lighthouseConfig,
      },
      timeout: 120000, // 2 minutes
    })

    // Transform Browserless response to our format
    const lhr = response as any

    const result: LighthouseScanResult = {
      url: lhr.finalUrl || lhr.requestedUrl || options.url,
      fetchTime: lhr.fetchTime,
      categories: {},
      audits: {},
    }

    // Extract category scores
    for (const [categoryId, category] of Object.entries(lhr.categories || {})) {
      result.categories[categoryId] = {
        id: (category as any).id,
        title: (category as any).title,
        score: (category as any).score,
      }
    }

    // Extract key audits
    const keyAudits = [
      'first-contentful-paint',
      'largest-contentful-paint',
      'total-blocking-time',
      'cumulative-layout-shift',
      'speed-index',
      'interactive',
      'server-response-time',
    ]

    for (const auditId of keyAudits) {
      if (lhr.audits?.[auditId]) {
        const audit = lhr.audits[auditId]
        result.audits[auditId] = {
          id: audit.id,
          title: audit.title,
          description: audit.description,
          score: audit.score,
          displayValue: audit.displayValue,
          numericValue: audit.numericValue,
        }
      }
    }

    return result
  }
  catch (e: any) {
    throw createError({
      statusCode: e.status || 500,
      statusMessage: `Browserless scan failed: ${e.message || 'Unknown error'}`,
    })
  }
}
```

### 3. Update Configuration

```typescript
// nitro.config.ts
export default defineNitroConfig({
  srcDir: 'server',
  runtimeConfig: {
    browserless: {
      url: '', // .env NITRO_BROWSERLESS_URL (default: https://chrome.browserless.io)
      token: '', // .env NITRO_BROWSERLESS_TOKEN (required)
    },
  },
  routeRules: {
    '/api/**': { cors: true },
  },
  compatibilityDate: '2025-06-15',
})
```

### 4. Environment Variables

```bash
# .env
NITRO_BROWSERLESS_TOKEN=your-api-token-here
# Optional: self-hosted Browserless instance
# NITRO_BROWSERLESS_URL=https://your-browserless-instance.com
```

### 5. Update API Endpoint

```typescript
// server/api/scan.post.ts
import { runLighthouseScanViaBrowserless } from '../app/services/lighthouse-browserless'

// Replace runLighthouseScan with runLighthouseScanViaBrowserless
const result = await runLighthouseScanViaBrowserless(scanOptions)
```

## Simplified Architecture

With Browserless, you can **remove**:
- ❌ `chrome-pool.ts` - No Chrome management needed
- ❌ `scan-queue.ts` - Browserless handles queuing
- ❌ `lifecycle.ts` plugin - No cleanup needed
- ✅ Keep `result-cache.ts` - Still useful for your app

**New flow:**
```typescript
Request → Cache Check → Browserless API → Cache Result → Response
```

## Pricing (2024)

**Browserless.io Plans:**
- **Free**: 6 hours/month (~360 scans)
- **Starter**: $30/month - 100 hours (~6,000 scans)
- **Business**: $150/month - 500 hours (~30,000 scans)
- **Enterprise**: Custom pricing

**vs Self-Hosted:**
- Server: $40-200/month (4-8GB RAM)
- Maintenance: Engineering time
- Monitoring: Additional services

**Browserless is cheaper** for most use cases + zero maintenance.

## Self-Hosted Browserless (Optional)

You can also self-host Browserless using Docker:

```bash
docker run -p 3000:3000 browserless/chrome
```

This gives you:
- ✅ Same API interface
- ✅ No vendor lock-in
- ✅ Control over infrastructure
- ✅ No per-request costs

**Best of both worlds:**
- Use managed Browserless for production
- Self-host for development/testing

## Migration Path

1. **Phase 1**: Add Browserless integration alongside current implementation
2. **Phase 2**: A/B test both approaches
3. **Phase 3**: Migrate fully to Browserless, remove Chrome pool code
4. **Phase 4**: Keep cache layer for performance

## Comparison Matrix

| Feature | Self-Hosted | Browserless Cloud | Self-Hosted Browserless |
|---------|-------------|-------------------|-------------------------|
| Setup Time | High | Minutes | Medium |
| Infrastructure | You manage | Managed | You manage |
| Scaling | Manual | Automatic | Docker scaling |
| Cost (low volume) | $40+/month | Free-$30/month | $20+/month |
| Cost (high volume) | $100+/month | $150+/month | $50+/month |
| Maintenance | High | None | Medium |
| Latency | Low | Medium | Low |
| Reliability | DIY | 99.9% SLA | DIY |

## Recommendation

**For minimal infrastructure:** Use **Browserless.io** (managed)

**Reasons:**
1. Zero Chrome management complexity
2. Automatic scaling and queuing
3. Cost-effective for most volumes
4. Battle-tested reliability
5. Focus on your API logic, not browser lifecycle

**When to self-host:**
- Very high volume (>50,000 scans/month)
- Need lowest possible latency
- Regulatory requirements (data must stay in your infrastructure)
- Already have container orchestration expertise

## Alternative: Hybrid Approach

Keep cache layer + use Browserless:

```typescript
Request → Cache Check (fast) → Browserless (if miss) → Cache Result
           ↓ Hit: <100ms          ↓ 15-20s              ↓ Store
           Return cached          Fresh scan             Return
```

This gives you:
- ✅ Fast cached responses
- ✅ No Chrome management
- ✅ Lower Browserless costs (fewer API calls)
- ✅ Minimal infrastructure

## Next Steps

To implement Browserless:

1. Sign up at https://browserless.io
2. Get your API token
3. Add `@browserless/lighthouse` dependency
4. Replace Chrome pool with Browserless service
5. Remove Chrome-related code
6. Deploy and monitor

Would you like me to create a pull request with the Browserless implementation?
