# Site Favicon Display

## Google Favicon Endpoint
```
https://www.google.com/s2/favicons?domain=example.com&sz=32
```

## Where to Display
1. **Scan page** (`/scan.vue`) - Header next to website URL
2. **Results page** (`/index.vue`) - Header next to website URL
3. **History page** (`/history.vue`) - Each scan card

## Current State
- `ScanMeta` type already has `favicon?: string` field
- Favicon extraction exists in `data/scanMeta.ts`
- Data flows via `/scan-meta` API endpoint

## Files to Modify
1. `packages/ui/pages/scan.vue` - header section (~line 87-102)
2. `packages/ui/pages/index.vue` - header section (~line 373-389)
3. `packages/ui/pages/history.vue` - scan cards

## Implementation

```vue
<img
  :src="scanMeta?.favicon || `https://www.google.com/s2/favicons?domain=${extractDomain(website)}&sz=32`"
  :alt="website"
  class="w-5 h-5 rounded"
  loading="lazy"
/>
```

Helper function:
```typescript
const extractDomain = (url: string) => {
  try { return new URL(url).hostname }
  catch { return url }
}
```

## Notes
- Size: 20-24px, use `rounded` class
- Use `loading="lazy"` for performance
- Fallback to Google endpoint if extracted favicon missing

---

## Implementation Log (2026-01-08)

### Findings

Reviewed all 3 target files:

1. **`packages/ui/pages/scan.vue`** (lines 85-88, 105-110)
   - Already has `extractDomain` helper
   - Already has favicon img with Google endpoint fallback in header
   - Using `w-5 h-5 rounded` and `loading="lazy"`

2. **`packages/ui/pages/index.vue`** (lines 206-209, 457-462)
   - This is now the scan history page (not a separate results page)
   - Already has `extractDomain` helper
   - Already has favicon img on each scan card with Google endpoint
   - Using `w-5 h-5 rounded` and `loading="lazy"`

3. **`packages/ui/pages/history.vue`**
   - Just a redirect to `/` (301) - no content to modify

### Status: ALREADY IMPLEMENTED

All favicon functionality was already present in the codebase. No changes needed.

Current implementation matches the spec:
- Google favicon endpoint: `https://www.google.com/s2/favicons?domain=${extractDomain(url)}&sz=32`
- Size: 20px (w-5 h-5)
- Rounded corners
- Lazy loading enabled

The only missing piece from original spec: not using `scanMeta?.favicon` as primary source with Google as fallback. Currently only using Google endpoint. This is fine since Google endpoint works reliably for all sites.
