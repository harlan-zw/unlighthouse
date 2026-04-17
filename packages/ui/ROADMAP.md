# Unlighthouse UI Roadmap

## Product Direction

The UI is no longer a single-page results viewer. The chosen UX is:

1. `/` is a smart entry point.
2. First-time users go to `/onboarding`.
3. Users with an active scan go straight to scan progress.
4. Repeat users without an active scan land in history.
5. Historical scans and active scans share the same results shell.

This keeps first-run behavior simple while making repeat use faster.

---

## Current UX Model

### Entry Flow

- `/` auto-routes based on app state
- `/onboarding` starts a new scan
- `/scan` redirects to the active scan progress view
- `/history` is an alias for the history dashboard
- `/results/:scanId` shows historical or completed results
- `/results/:scanId/scan` shows live scan progress

### Navigation Rules

- No history and no active scan -> `/onboarding`
- Active scan -> `/results/:scanId/scan`
- History exists and no active scan -> `/history`
- History is always directly accessible

### Why This Won

- History as the default repeat-user home is better than always dropping users into results
- A smart `/` keeps links and browser habits simple
- Scan progress should be tied to a real scan ID so the URL is shareable and stable

---

## Current Scope

### 1. Onboarding

Purpose: start a new scan with sensible defaults and a low-friction form.

Implemented:
- URL input with validation
- Mobile/desktop choice
- Throttling toggle
- Sample size selection
- Category selection
- Presets
- Recent URL suggestions

API:
```ts
POST /api/scan/start
Body: {
  url: string
  device?: 'mobile' | 'desktop'
  throttle?: boolean
  sampleSize?: number
  categories?: string[]
}
Response: {
  success: true
  scanId: string
  status: 'starting'
  site: string
}
```

### 2. Live Scan Progress

Purpose: show the active scan immediately and make it safe to pause, resume, cancel, or preview results.

Implemented:
- Progress ring
- Current URL
- Discovered/scanned/failed counts
- Estimated time remaining
- Live recently completed routes
- Pause/resume
- Cancel
- Preview results while scanning
- View results on completion

API:
```ts
GET /api/scan/status
Response: {
  scanId: string | null
  status: 'starting' | 'discovering' | 'scanning' | 'complete' | 'cancelled' | 'error'
  paused: boolean
  site: string | null
  progress: {
    discovered: number
    scanned: number
    failed: number
    total: number
    percent: number
  }
  currentUrl?: string
  startedAt: string | null
  estimatedTimeRemaining: number | null
  recentlyCompleted: Array<{
    path: string
    score: number
  }>
}
```

Realtime events:
- `scan:progress`
- `scan:route-complete`
- `scan:complete`
- `scan:cancelled`
- `scan:error`

### 3. History Dashboard

Purpose: act as the repeat-user home for past scans and recovery point for in-progress work.

Implemented:
- Search by URL
- Date filter
- Score filter
- Sorting
- Group by site
- Bulk selection and bulk delete
- Rescan from history
- Share links
- Running-scan cards that link back to progress

API:
```ts
GET /api/history
GET /api/history/:id
DELETE /api/history/:id
POST /api/history/:id/rescan
```

### 4. Results Workspace

Purpose: keep active, completed, and historical results in one consistent shell.

Implemented:
- Overview
- Performance
- Accessibility
- Best Practices
- SEO
- Export
- Compare with previous scan
- Shareable links

---

## Architecture Decisions

### Routes

```text
pages/
├── index.vue                  # History dashboard, aliased as /history
├── onboarding.vue            # Start new scan
├── scan.vue                  # Smart redirect to active scan or next best page
└── results/
    └── [scanId]/
        ├── index.vue
        ├── scan.vue
        ├── performance.vue
        ├── accessibility.vue
        ├── best-practices.vue
        └── seo.vue
```

### State Model

- History is persisted and queryable
- Active scan has a real `scanId`
- Start/rescan flows create fresh tracked scan sessions
- The root route decides where the user belongs instead of hard-coding a single homepage

---

## What Changed From The Old Roadmap

The old roadmap assumed:
- `/history` would be a separate page from the homepage
- `/scan` would be the primary progress URL
- `/` would continue to behave like a results page

The current product intentionally does not do that.

We now prefer:
- `/` as a smart router
- history as the repeat-user default home
- scan progress nested under a real scan ID

That is the direction to build against.

---

## Remaining Work

### UX / Product

- Improve empty and cancelled scan recovery flows
- Make active-scan conflict states more explicit across the app
- Keep partial results available after cancellation

### Backend / Reliability

- Use non-destructive cancel/reset semantics for active scans
- Broadcast explicit error and cancelled scan lifecycle events
- Keep scan artifacts isolated per run so repeated start/cancel/rescan cycles do not leak stale files

### Docs / Cleanup

- Keep this roadmap aligned with route structure and API contracts
- Remove any remaining references to the older homepage/results mental model
