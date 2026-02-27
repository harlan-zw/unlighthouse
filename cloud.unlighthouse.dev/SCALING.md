# Scaling Architecture

The `cloud.unlighthouse.dev` API is designed to handle many concurrent Lighthouse scan requests while maintaining accurate performance metrics. This document explains the architecture and how to configure it for optimal performance.

## Architecture Overview

The API uses three key components to achieve scalability:

1. **Chrome Instance Pool** - Reuses browser instances across scans
2. **Request Queue** - Manages concurrent scans with configurable limits
3. **Result Cache** - Reduces redundant scans for the same URL

```
┌─────────────┐
│   Request   │
└──────┬──────┘
       │
       ▼
┌─────────────┐     Cache Hit?    ┌─────────────┐
│    Cache    │────────Yes────────▶│   Return    │
└──────┬──────┘                    └─────────────┘
       │ No
       ▼
┌─────────────┐
│    Queue    │
└──────┬──────┘
       │
       ▼
┌─────────────┐     Acquire       ┌─────────────┐
│  Scan Job   │──────────────────▶│ Chrome Pool │
└──────┬──────┘                    └─────────────┘
       │
       ▼
┌─────────────┐
│  Lighthouse │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Cache Result│
└─────────────┘
```

## Chrome Instance Pool

The Chrome pool maintains a configurable number of browser instances that are reused across scans. This significantly reduces the overhead of launching and killing Chrome for each request.

### Configuration

```typescript
// nitro.config.ts or .env
runtimeConfig: {
  lighthouse: {
    minChromeInstances: 1,    // Minimum pool size
    maxChromeInstances: 5,    // Maximum pool size
    chromeIdleTimeout: 300000 // 5 minutes (ms)
  }
}
```

### Environment Variables

```bash
NITRO_LIGHTHOUSE_MIN_CHROME_INSTANCES=2
NITRO_LIGHTHOUSE_MAX_CHROME_INSTANCES=8
NITRO_LIGHTHOUSE_CHROME_IDLE_TIMEOUT=300000
```

### How It Works

- Pool starts with `minChromeInstances` on server startup
- When all instances are busy, new ones are created up to `maxChromeInstances`
- Idle instances (unused for `chromeIdleTimeout`) are automatically cleaned up
- Pool never goes below `minChromeInstances`

### Monitoring

```bash
GET /api/metrics
```

Response includes Chrome pool stats:
```json
{
  "chromePool": {
    "total": 3,
    "available": 1,
    "inUse": 2,
    "minInstances": 1,
    "maxInstances": 5
  }
}
```

## Request Queue

The queue limits concurrent Lighthouse scans to maintain metric accuracy. Too many concurrent scans can affect CPU and network, leading to inaccurate performance measurements.

### Configuration

Default: **3 concurrent scans** (recommended for accurate metrics)

```bash
# Adjust dynamically via API
POST /api/queue/config
{
  "maxConcurrency": 5
}
```

### Why Limit Concurrency?

Lighthouse measures real performance metrics. Running too many scans simultaneously:
- Competes for CPU resources (affects TBT, FID metrics)
- Saturates network bandwidth (affects LCP, FCP metrics)
- Can cause inaccurate throttling simulation

**Recommended values:**
- **1-3**: Most accurate metrics, lower throughput
- **3-5**: Balanced accuracy and throughput
- **5-10**: Higher throughput, may affect accuracy

### Queue Behavior

1. Requests are queued when concurrency limit is reached
2. Scans are processed FIFO (first in, first out)
3. Failed scans are removed from queue
4. Queue automatically processes next scan when one completes

## Result Cache

The cache stores scan results with a TTL (time-to-live) to avoid redundant scans.

### Configuration

Default: **1000 entries, 1 hour TTL**

### Cache Key

Results are cached based on:
- URL (normalized)
- Categories
- Form factor (mobile/desktop)
- Throttling setting

### Cache Behavior

```bash
# Check if cached
GET /api/scan
{
  "url": "https://example.com",
  "useCache": true  # Default
}

# Response includes cache status
{
  "url": "https://example.com",
  "cached": true,  # Indicates cache hit
  ...
}
```

### Cache Management

```bash
# Invalidate specific URL
POST /api/cache/invalidate
{
  "url": "https://example.com"
}

# Clear entire cache
POST /api/cache/invalidate
{
  "clearAll": true
}
```

### Cache Stats

```bash
GET /api/metrics
```

Response includes:
```json
{
  "cache": {
    "size": 245,
    "hits": 1523,
    "misses": 892,
    "hitRate": 0.63,
    "oldestEntry": 1699564320000,
    "newestEntry": 1699567920000
  }
}
```

## Scaling Strategies

### Vertical Scaling (Single Server)

For a single server, adjust based on your resources:

```bash
# Small server (2-4 CPU cores, 4-8GB RAM)
NITRO_LIGHTHOUSE_MAX_CHROME_INSTANCES=3
NITRO_LIGHTHOUSE_MAX_CONCURRENCY=2

# Medium server (4-8 CPU cores, 8-16GB RAM)
NITRO_LIGHTHOUSE_MAX_CHROME_INSTANCES=5
NITRO_LIGHTHOUSE_MAX_CONCURRENCY=3

# Large server (8+ CPU cores, 16+ GB RAM)
NITRO_LIGHTHOUSE_MAX_CHROME_INSTANCES=8
NITRO_LIGHTHOUSE_MAX_CONCURRENCY=5
```

### Horizontal Scaling (Multiple Servers)

For high throughput, deploy multiple instances behind a load balancer:

```
                 ┌─────────────┐
                 │Load Balancer│
                 └──────┬──────┘
                        │
         ┌──────────────┼──────────────┐
         │              │              │
    ┌────▼───┐     ┌────▼───┐     ┌────▼───┐
    │ API #1 │     │ API #2 │     │ API #3 │
    └────────┘     └────────┘     └────────┘
```

**Key considerations:**
- Each instance has its own cache (consider adding Redis for shared cache)
- Use sticky sessions or consistent hashing to maximize cache hits
- Monitor each instance's metrics separately
- Scale based on queue depth and response times

### Cache Optimization

To maximize cache hits:

1. **Use longer TTLs for stable sites:**
   ```typescript
   // Modify result-cache.ts defaultTTL
   new ResultCache(1000, 24 * 60 * 60 * 1000) // 24 hours
   ```

2. **Increase cache size for high traffic:**
   ```typescript
   new ResultCache(5000, 60 * 60 * 1000) // 5000 entries
   ```

3. **Pre-warm cache for common URLs:**
   ```bash
   # Run scans for common URLs during off-peak hours
   curl -X POST /api/scan -d '{"url": "https://popular-site.com"}'
   ```

## Monitoring and Observability

### Health Endpoint

```bash
GET /api/health
```

Returns service health status:
```json
{
  "status": "healthy",
  "timestamp": "2025-11-10T...",
  "checks": {
    "chromePool": {
      "status": "pass",
      "instances": 3
    },
    "queue": {
      "status": "pass",
      "size": 2,
      "processing": 3
    }
  }
}
```

### Metrics Endpoint

```bash
GET /api/metrics
```

Comprehensive metrics for all components:
```json
{
  "timestamp": "2025-11-10T...",
  "queue": {
    "queued": 5,
    "processing": 3,
    "completed": 1234,
    "failed": 12,
    "totalProcessed": 1246,
    "averageProcessingTime": 15234,
    "maxConcurrency": 3
  },
  "cache": {
    "size": 456,
    "hits": 2345,
    "misses": 678,
    "hitRate": 0.776
  },
  "chromePool": {
    "total": 4,
    "available": 1,
    "inUse": 3
  },
  "memory": {
    "used": 512,
    "total": 1024,
    "rss": 768
  }
}
```

### Key Metrics to Monitor

1. **Queue depth** (`queue.queued`): If consistently high, increase concurrency or add servers
2. **Average processing time** (`queue.averageProcessingTime`): Should be 10-30 seconds
3. **Cache hit rate** (`cache.hitRate`): Higher is better, aim for >60%
4. **Chrome pool utilization** (`chromePool.inUse / chromePool.total`): Should be <90% most of the time
5. **Failed scans** (`queue.failed / queue.totalProcessed`): Should be <5%

## Performance Benchmarks

Based on typical hardware:

| Server Specs | Max Concurrency | Throughput | Avg Response Time |
|--------------|----------------|------------|-------------------|
| 2 CPU, 4GB RAM | 2 | ~8 scans/min | 15-20s |
| 4 CPU, 8GB RAM | 3 | ~12 scans/min | 15-20s |
| 8 CPU, 16GB RAM | 5 | ~20 scans/min | 15-20s |

**Note:** Response times include queue wait time. Cached responses are <100ms.

## Troubleshooting

### High Queue Depth

**Symptoms:** Many requests waiting in queue

**Solutions:**
1. Increase `maxConcurrency` (if server has capacity)
2. Add more Chrome instances (up to `maxConcurrency` value)
3. Deploy additional server instances

### High Memory Usage

**Symptoms:** Memory usage consistently near limits

**Solutions:**
1. Reduce `maxChromeInstances`
2. Reduce cache size in `result-cache.ts`
3. Decrease `chromeIdleTimeout` to clean up idle instances faster
4. Add more RAM or reduce `maxConcurrency`

### Low Cache Hit Rate

**Symptoms:** `cache.hitRate` < 40%

**Solutions:**
1. Increase cache TTL
2. Increase cache size
3. Analyze traffic patterns - if all scans are unique URLs, caching won't help

### Chrome Instances Not Starting

**Symptoms:** Health check fails, no Chrome instances

**Solutions:**
1. Check Chrome is installed: `google-chrome --version`
2. Check permissions for headless Chrome
3. Add required flags in `chrome-pool.ts`:
   ```typescript
   chromeFlags: [
     '--headless',
     '--no-sandbox',
     '--disable-gpu',
     '--disable-dev-shm-usage',
     '--disable-software-rasterizer'
   ]
   ```

## Best Practices

1. **Start conservative:** Begin with default settings (3 concurrency, 5 max Chrome instances)
2. **Monitor first:** Collect metrics for 24-48 hours before adjusting
3. **Scale gradually:** Increase concurrency by 1-2 at a time
4. **Test accuracy:** Periodically compare results against Lighthouse CLI to ensure accuracy isn't degraded
5. **Use caching:** Keep `useCache: true` (default) for most requests
6. **Health checks:** Integrate `/api/health` into your monitoring/alerting system
7. **Resource limits:** Set appropriate memory/CPU limits in your container/VM
8. **Graceful shutdown:** Ensure proper cleanup of Chrome instances on shutdown

## API Reference

### Scan with Options

```bash
POST /api/scan
{
  "url": "https://example.com",
  "categories": ["performance", "accessibility"],
  "formFactor": "mobile",
  "throttling": "mobile4G",
  "useCache": true
}
```

### Configure Queue

```bash
POST /api/queue/config
{
  "maxConcurrency": 5
}
```

### Invalidate Cache

```bash
POST /api/cache/invalidate
{
  "url": "https://example.com"
}
```

### Get Metrics

```bash
GET /api/metrics
```

### Health Check

```bash
GET /api/health
```
