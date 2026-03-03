# Crawlee Migration - Two-Phase Architecture

## Status: IMPLEMENTED

The Crawlee migration has been implemented. The two-phase URL discovery architecture is now in place.

## Implementation Summary

### Files Created
- `packages/core/src/crawl/index.ts` - Main crawlee orchestration with:
  - `discoverUrlsViaCrawlee()` - Phase 1: URL Discovery using HttpCrawler/PlaywrightCrawler
  - `filterUrls()` - Phase 2: Apply all filtering rules
  - `crawlSite()` - Main orchestration combining both phases

### Files Modified
- `packages/core/src/unlighthouse.ts` - Now uses `crawlSite()` instead of `resolveReportableRoutes()`
- `packages/core/src/discovery/routes.ts` - Removed `discovered-internal-links` hook setup, extracted `discoverInitialUrls()` and `applyDynamicSampling()` functions
- `packages/core/src/puppeteer/tasks/html.ts` - Removed hook call, now only counts links for reporting
- `packages/core/src/index.ts` - Exports crawl module
- `packages/core/package.json` - Added crawlee dependency
- `pnpm-workspace.yaml` - Added crawlee to catalog

## New Two-Phase Flow

```
Phase 1: URL Discovery
├─ discoverInitialUrls() - Sitemap.xml, manual URLs, route definitions
├─ discoverUrlsViaCrawlee() - Crawlee HTTP/Playwright crawling (if scanner.crawler)
└─ Merge & deduplicate into Set

Phase 2: Filtering (filterUrls)
├─ Apply origin validation (isScanOrigin)
├─ Apply include/exclude patterns (createFilter)
├─ Apply robots.txt rules (matchPathToRule)
├─ Apply HTML type validation (isImplicitOrExplicitHtml)
├─ Apply dynamicSampling (group-based rate limiting)
└─ Apply maxRoutes limit

Phase 3: Lighthouse Audits (unchanged)
├─ worker.queueRoutes() → Puppeteer cluster
├─ inspectHtmlTask (HTML only, NO link discovery)
└─ runLighthouseTask
```

## Key Changes
1. **No live route discovery** - all URLs discovered before auditing starts
2. **Single-pass filtering** - filtering applied once after all discovery
3. **`discovered-internal-links` hook deprecated** - no longer used for crawling
4. **Memory efficient** - URLs stored in Set during discovery, routes only created after filtering
5. **Dual crawler support** - HttpCrawler (fast) for static sites, PlaywrightCrawler for JS-rendered sites

## API Exports

```typescript
// From @unlighthouse/core
export { crawlSite, discoverUrlsViaCrawlee, filterUrls } from './crawl'
export type { CrawlProgress, DiscoverUrlsConfig } from './crawl'
```

## Configuration Options

The existing config options control the crawl behavior:
- `scanner.crawler` - Enable/disable Crawlee crawling
- `scanner.skipJavascript` - Use HttpCrawler (true) or PlaywrightCrawler (false)
- `scanner.maxRoutes` - Limit final routes after filtering
- `scanner.dynamicSampling` - Group-based route sampling
- `scanner.include` / `scanner.exclude` - URL patterns
- `scanner.robotsTxt` - Apply robots.txt rules
