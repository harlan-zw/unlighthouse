# Share Button Bug

## Current Behavior/Bug
Share button doesn't work even when scan is completed. Button is in `pages/index.vue` (lines 427-435).

## Root Cause
Race condition in `copyShareLink()` function (lines 346-366):
- For live scans, fetches latest history entry via `/api/history?limit=1&site=...`
- Scan hasn't been saved to history yet when scan completes
- History tracking happens via hooks in background - timing issue

## Files to Modify
1. `packages/ui/pages/index.vue` - `copyShareLink()` function
2. `packages/core/src/router/api.ts` - possibly add dedicated endpoint
3. `packages/core/src/data/history/tracking.ts` - ensure timely completion

## Fix Approach

Option 1: Add retry logic with backoff in `copyShareLink()`:
```typescript
const maxRetries = 3
for (let i = 0; i < maxRetries; i++) {
  const data = await $fetch(`${apiUrl}/history?limit=1&site=...`)
  if (data?.scans?.[0]) break
  await new Promise(r => setTimeout(r, 500 * (i + 1)))
}
```

Option 2: Add dedicated `/api/share` or `/api/current-scan-id` endpoint

Option 3: Track current scan ID in UI state during scan, use directly for share URL

## What Share Should Do
1. Historical scans: Copy current URL with `?scanId=`
2. Live scans: Get current scan ID, generate shareable URL, copy to clipboard
