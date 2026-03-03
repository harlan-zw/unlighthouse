# Preview Results Button During Scan

## Current Behavior
- Scan page shows live progress, recently completed routes, current URL being scanned
- Auto-redirects to results page when scan completes
- Users cannot preview partial results during scan

## Files to Modify
1. `packages/ui/pages/scan.vue` - Add preview button (~line 250)
2. Results page already supports partial data via `isScanning` computed

## Implementation

Add button in `scan.vue` action buttons section:

```vue
<UButton
  v-if="scanState.progress.scanned > 0"
  color="primary"
  icon="i-heroicons-chart-bar"
  @click="router.push('/')"
>
  Preview Results
</UButton>
```

## Notes
- No backend changes needed - `/api/reports` already serves in-progress reports
- Results page handles `isScanning` state, shows spinners for incomplete routes
- Screenshots available after HTML inspection, scores after lighthouse runs
- WebSocket keeps data fresh in real-time

---

## Implementation Log

### 2026-01-08

**Status: Already Implemented**

Found "Preview Results" button already exists in `packages/ui/pages/scan.vue` at lines 271-278:

```vue
<UButton
  v-if="(isScanning || scanState.paused) && scanState.progress.scanned > 0"
  color="primary"
  icon="i-heroicons-chart-bar"
  @click="router.push('/results')"
>
  Preview Results
</UButton>
```

Button shows when:
- Scan is active (`isScanning`) or paused (`scanState.paused`)
- AND at least one route scanned (`scanState.progress.scanned > 0`)

Navigates to `/results` which matches existing `goToResults()` function.

**No changes needed - task already complete.**
