# Unlighthouse UI Roadmap

## Overview

Expanding the UI from a single-page results viewer to a multi-page application with onboarding, real-time scan monitoring, and historical data.

## New Pages

### 1. Onboarding Page (`/onboarding`)

Collect scan configuration before starting.

**UI Elements:**
- URL input (required)
- Device selector (mobile/desktop)
- Throttling toggle
- Sample size selector (for large sites)
- Category checkboxes (performance, a11y, best-practices, seo)
- "Start Scan" button

**Flow:**
1. User lands on onboarding if no active scan
2. Fills in configuration
3. Clicks start → redirects to `/scan`

**API Requirements:**
```
POST /api/scan/start
Body: {
  url: string
  device: 'mobile' | 'desktop'
  throttle: boolean
  sampleSize?: number
  categories?: string[]
}
Response: { scanId: string, status: 'starting' }
```

---

### 2. Scan Progress Page (`/scan` or `/scan/:id`)

Real-time scan monitoring with progress visualization.

**UI Elements:**
- Large progress ring/bar
- Current URL being scanned
- Routes discovered vs scanned counts
- Live feed of completed routes (last 5-10)
- Estimated time remaining
- Cancel scan button
- "View Results" button (enabled when complete)

**States:**
- `starting` - Initializing crawler
- `discovering` - Finding routes
- `scanning` - Running Lighthouse
- `complete` - All done
- `cancelled` - User stopped
- `error` - Something failed

**API Requirements:**
```
GET /api/scan/status
Response: {
  scanId: string
  status: 'starting' | 'discovering' | 'scanning' | 'complete' | 'cancelled' | 'error'
  progress: {
    discovered: number
    scanned: number
    failed: number
    total: number
  }
  currentUrl?: string
  startedAt: string
  estimatedCompletion?: string
  error?: string
}

POST /api/scan/cancel
Response: { success: boolean }

WebSocket: /api/ws
Events:
  - scan:progress { discovered, scanned, total }
  - scan:route-complete { route, scores }
  - scan:complete { summary }
  - scan:error { message }
```

---

### 3. History Page (`/history`)

View and manage past scans.

**UI Elements:**
- List/grid of past scans
- Each scan card shows:
  - Site URL
  - Date/time
  - Overall score
  - Route count
  - Device used
- Actions: View, Delete, Re-scan
- Filters: date range, site, score range
- Search by URL

**Data Storage:**
- Store scan metadata in SQLite or JSON files
- Keep reports in existing file structure
- Add index file for quick lookups

**API Requirements:**
```
GET /api/history
Query: { limit?, offset?, site?, dateFrom?, dateTo? }
Response: {
  scans: [{
    id: string
    url: string
    scannedAt: string
    device: 'mobile' | 'desktop'
    routeCount: number
    avgScore: number
    status: 'complete' | 'partial' | 'failed'
  }]
  total: number
}

GET /api/history/:id
Response: {
  ...scan metadata
  reports: UnlighthouseRouteReport[]
}

DELETE /api/history/:id
Response: { success: boolean }

POST /api/history/:id/rescan
Response: { newScanId: string }
```

---

## Updated Page Structure

```
pages/
├── index.vue          # Results page (current fresh design)
├── onboarding.vue     # Pre-scan configuration
├── scan.vue           # Live scan progress
└── history.vue        # Past scans list
```

## Navigation Flow

```
┌─────────────┐     ┌──────────┐     ┌─────────┐
│  Onboarding │ ──▶ │   Scan   │ ──▶ │ Results │
└─────────────┘     └──────────┘     └─────────┘
                          │                │
                          ▼                ▼
                    ┌──────────┐     ┌─────────┐
                    │  Cancel  │     │ History │
                    └──────────┘     └─────────┘
```

**Auto-routing logic:**
- No scan config → `/onboarding`
- Scan in progress → `/scan`
- Scan complete → `/` (results)
- User can always access `/history`

---

## API Changes Summary

### New Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/scan/start` | Start new scan with config |
| GET | `/api/scan/status` | Get current scan status |
| POST | `/api/scan/cancel` | Cancel running scan |
| GET | `/api/history` | List past scans |
| GET | `/api/history/:id` | Get specific scan details |
| DELETE | `/api/history/:id` | Delete scan from history |
| POST | `/api/history/:id/rescan` | Re-run a past scan |

### WebSocket Events

| Event | Payload | Description |
|-------|---------|-------------|
| `scan:progress` | `{ discovered, scanned, total }` | Progress update |
| `scan:route-complete` | `{ route, scores }` | Single route finished |
| `scan:complete` | `{ summary }` | Scan finished |
| `scan:error` | `{ message }` | Error occurred |

---

## Data Storage

### Scan Metadata Schema

```typescript
interface ScanMetadata {
  id: string
  url: string
  config: {
    device: 'mobile' | 'desktop'
    throttle: boolean
    categories: string[]
    sampleSize?: number
  }
  status: 'running' | 'complete' | 'cancelled' | 'failed'
  progress: {
    discovered: number
    scanned: number
    failed: number
  }
  scores: {
    performance: number
    accessibility: number
    bestPractices: number
    seo: number
    average: number
  }
  startedAt: string
  completedAt?: string
  reportPath: string // Path to reports directory
}
```

### Storage Options

1. **JSON file** (`~/.unlighthouse/history.json`)
   - Simple, no dependencies
   - Good for small history

2. **SQLite** (`~/.unlighthouse/history.db`)
   - Better for querying/filtering
   - Scales better

---

## Implementation Order

1. **Phase 1: Scan Progress Page**
   - Add `/api/scan/status` endpoint
   - Create `scan.vue` page
   - Enhance WebSocket events

2. **Phase 2: History**
   - Add scan metadata storage
   - Create history API endpoints
   - Build `history.vue` page

3. **Phase 3: Onboarding**
   - Add `/api/scan/start` endpoint
   - Create `onboarding.vue` page
   - Add auto-routing logic

---

## UI Components Needed

- `ScanProgress.vue` - Circular/linear progress indicator
- `ScanCard.vue` - History item card
- `ConfigForm.vue` - Onboarding form
- `LiveFeed.vue` - Real-time route completion feed
- `ScoreBadge.vue` - Reusable score display
