# Cloud Unlighthouse API

Nitro API for running individual Lighthouse scans on demand with built-in scaling capabilities.

## Features

- 🚀 **Chrome Instance Pooling** - Reuses browser instances for better performance
- ⚡ **Request Queue** - Manages concurrent scans with configurable limits
- 💾 **Result Caching** - Reduces redundant scans with LRU cache
- 📊 **Monitoring Endpoints** - Real-time metrics and health checks
- 🎯 **Accurate Metrics** - Controlled concurrency ensures reliable Lighthouse scores

## Quick Start

### Development

```bash
pnpm install
pnpm dev
```

### Build

```bash
pnpm build
pnpm preview
```

## API Endpoints

### Run a Scan

```bash
POST /api/scan
Content-Type: application/json

{
  "url": "https://example.com",
  "categories": ["performance", "accessibility", "best-practices", "seo"],
  "formFactor": "mobile",
  "throttling": "mobile4G",
  "useCache": true
}
```

**Parameters:**
- `url` (required): URL to scan
- `categories` (optional): Array of categories to test. Valid: `performance`, `accessibility`, `best-practices`, `seo`, `pwa`
- `formFactor` (optional): `mobile` or `desktop` (default: `mobile`)
- `throttling` (optional): `mobile3G`, `mobile4G`, or `none` (default: `mobile4G`)
- `useCache` (optional): Use cached results if available (default: `true`)

**Response:**
```json
{
  "url": "https://example.com",
  "fetchTime": "2025-11-10T12:34:56.789Z",
  "cached": false,
  "categories": {
    "performance": {
      "id": "performance",
      "title": "Performance",
      "score": 0.95
    }
  },
  "audits": {
    "first-contentful-paint": {
      "score": 1,
      "displayValue": "0.8 s",
      "numericValue": 800
    }
  }
}
```

### Monitoring

#### Get Metrics
```bash
GET /api/metrics
```

Returns queue stats, cache stats, Chrome pool stats, and memory usage.

#### Health Check
```bash
GET /api/health
```

Returns service health status.

#### Configure Queue
```bash
POST /api/queue/config
{
  "maxConcurrency": 5
}
```

#### Invalidate Cache
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

## Configuration

Configure via environment variables:

```bash
# Chrome pool settings
NITRO_LIGHTHOUSE_MIN_CHROME_INSTANCES=1
NITRO_LIGHTHOUSE_MAX_CHROME_INSTANCES=5
NITRO_LIGHTHOUSE_CHROME_IDLE_TIMEOUT=300000

# Queue settings
NITRO_LIGHTHOUSE_MAX_CONCURRENCY=3
```

## Scaling

See [SCALING.md](./SCALING.md) for detailed information on:
- Architecture overview
- Performance tuning
- Horizontal and vertical scaling strategies
- Monitoring and troubleshooting
- Best practices

## How It Works

1. **Request arrives** → Check cache for existing result
2. **Cache miss** → Add to queue
3. **Queue processes** → Acquire Chrome instance from pool
4. **Run Lighthouse** → Execute scan with configured options
5. **Cache result** → Store for future requests
6. **Return result** → Send to client

This architecture ensures:
- ✅ Efficient resource usage (Chrome instance reuse)
- ✅ Accurate metrics (controlled concurrency)
- ✅ Fast responses (caching)
- ✅ High throughput (pooling and queuing)
