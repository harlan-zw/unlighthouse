# Unlighthouse on Cloudflare

A single Worker that hosts **both** the Unlighthouse dashboard (the Nuxt SPA)
and its API, with real Lighthouse running in a Cloudflare Container driving
Browser Rendering remotely. Open the Worker URL in a browser to use the panel;
the same origin serves `POST /api/scan/start` and the rest of the command API.

```
https://<worker>.workers.dev/                ← dashboard panel (Nuxt SPA, from ASSETS)
https://<worker>.workers.dev/api/scan/start  ← API (same origin, /api prefix)
```

## Architecture

```
Worker (static panel + HTTP API, D1, R2, DOs, cron sweeper)
  │ env.LIGHTHOUSE_CONTAINER.getByName('default').fetch('/audit', ...)
  ▼
LighthouseContainer (Node 24 image, ~250 MB, no Chromium)
  │ puppeteer.connect to wss://…/browser-rendering/…
  ▼
Browser Rendering (managed Chromium on Cloudflare's edge)
```

The Worker never imports `lighthouse` directly (it can't — `fileURLToPath` crashes
in the Workers runtime). The Container does the Lighthouse work and talks to
Cloudflare-hosted Chromium over CDP. Static dashboard assets are served straight
from the `ASSETS` binding; non-API GET routes fall back to the SPA's `index.html`.

## Prerequisites

- Cloudflare Workers **Paid** plan (Containers + Browser Rendering both require it; from $5/mo).
- `wrangler` ≥ 4 installed locally (`pnpm install` pulls it into this example).
- `wrangler login` once per machine.
- `pnpm` + a checkout of this monorepo (the panel is built from `packages/ui`).

## One-time setup

```sh
# 1. Provision D1, then paste the printed database_id into wrangler.toml.
wrangler d1 create unlighthouse

# 2. Provision R2.
wrangler r2 bucket create unlighthouse

# 3. Set secrets (stored encrypted by Wrangler; never in wrangler.toml):
wrangler secret put SHARED_AUDIT_TOKEN     # random 32 bytes: openssl rand -hex 32
wrangler secret put CF_ACCOUNT_ID          # your Cloudflare account ID
wrangler secret put CF_BROWSER_RUN_TOKEN   # API token, scope: Browser Rendering – Edit
wrangler secret put CRUX_API_KEY           # optional; enables the CrUX field-data tier

# 4. Edit wrangler.toml:
#    - paste the database_id from step 1
#    - set UNLIGHTHOUSE_CONFIG's "site" to a default target (scans can override it)
#    - bump UNLIGHTHOUSE_VERSION on each deploy (surfaced by /api/health)
```

## Build the dashboard panel (required before every deploy)

The Worker serves the **prebuilt** Nuxt SPA from `packages/ui/.output/public`
(referenced by the `[assets]` block in `wrangler.toml`). It is **not** built by
`wrangler deploy`, so build it yourself first. Two env vars must be set at build
time so the SPA talks to *this* Worker instead of a local dev server:

```sh
# From the repo root:
NUXT_PUBLIC_UNLIGHTHOUSE_API_URL=/api \
NUXT_PUBLIC_UNLIGHTHOUSE_WS_URL= \
  pnpm --filter @unlighthouse/ui build
```

| Build env var                       | Value  | Why                                                                                         |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| `NUXT_PUBLIC_UNLIGHTHOUSE_API_URL`  | `/api` | Same-origin API base. The Worker strips the `/api` prefix and routes to the command handlers. |
| `NUXT_PUBLIC_UNLIGHTHOUSE_WS_URL`   | *(empty)* | This deploy has no global WebSocket bus, so the panel skips the socket and uses REST polling. Leaving it unset would default to `ws://localhost:5678/...` and spam connection errors. |

> Defaults (used by `pnpm dev` locally) live in `packages/ui/nuxt.config.ts`:
> `http://localhost:5678/api` and `ws://localhost:5678/api/ws`. The two env vars
> above override them for production.
>
> **Don't** put these in `packages/ui/.env` — `nuxi dev` reads it too and would
> point your local dashboard at `/api` (no dev server there). Keep them on the
> build command (or use the `deploy` script below, which sets them for you).

## Deploy

```sh
# From this directory (packages/cloudflare/examples/basic):
pnpm deploy
```

`pnpm deploy` runs `build:panel` (builds the Nuxt SPA with the production env
vars from the table above — you don't set them by hand) and then `wrangler
deploy`, which:
1. uploads the built panel from `../../../ui/.output/public` to the `ASSETS` binding,
2. builds + pushes the Container image (skipped if unchanged),
3. deploys the Worker and runs the DO migrations (`v1` ScanEvents + RateLimiter,
   `v2` LighthouseContainer).

The D1 schema is applied in-process on the first request (`CREATE TABLE IF NOT
EXISTS`, idempotent) — no separate `wrangler d1 migrations apply` needed.

> `pnpm deploy:worker-only` skips the panel rebuild — use it when only the
> Worker/preset code changed and the panel is already current.

If you changed the Worker preset itself (`@unlighthouse/cloudflare`), build it
too before deploying:

```sh
pnpm --filter @unlighthouse/cloudflare build
```

## Verify

```sh
WORKER=https://<your-worker>.workers.dev   # e.g. https://unlighthouse.srvrun.workers.dev

# 1. Panel loads (HTML).
curl -fsS -o /dev/null -w '%{http_code} %{content_type}\n' $WORKER/
# → 200 text/html

# 2. A deep UI route falls back to the SPA (not a 404).
curl -fsS -o /dev/null -w '%{http_code} %{content_type}\n' "$WORKER/sites/example.com"
# → 200 text/html

# 3. API is up (works with or without the /api prefix).
curl -fsS $WORKER/api/health
# → { "ok": true, "version": "...", "storage": { "rows": "ok", "blobs": "ok" }, ... }

# 4. Kick a real scan. Run `wrangler tail` in another terminal to watch the
#    Container boot and Lighthouse run.
SCAN=$(curl -fsS -X POST $WORKER/api/scan/start \
  -H 'content-type: application/json' \
  -d '{"site":"https://example.com","device":["mobile","desktop"]}' | jq -r .scanId)
echo "scanId=$SCAN"

# 5. Poll until complete.
while [ "$(curl -fsS "$WORKER/api/scan/status?scanId=$SCAN" | jq -r .status)" != "complete" ]; do
  sleep 5
done

# 6. Real Lighthouse ran when scores are non-null numbers (mock returns null).
curl -fsS "$WORKER/api/scan/results?scanId=$SCAN&pageSize=1" \
  | jq '.items[0] | {device, scorePerformance, lcp, scoreSeo}'
# → { "device": "mobile", "scorePerformance": 0.9, "lcp": 1200, "scoreSeo": 1 }
```

Then open `$WORKER/` in a browser — the dashboard should show the site, the
scan in **History**, and the per-route report under the scan's pages.

## Notes & known limits

- **No live progress bar.** This deploy has no WebSocket event bus, so the panel
  doesn't stream per-route progress while a scan runs — it polls and the status
  jumps from `starting` to `complete`. The scan itself runs fine; only the live
  animation is absent. (Wiring `events.subscribe` through `SCAN_EVENTS_DO` to the
  UI's WS bus is a future enhancement.)
- **Rebuild the panel when the UI changes.** `wrangler deploy` ships whatever is
  currently in `packages/ui/.output/public`. Stale panel = rebuild + redeploy.
- **`/api` prefix.** The command router mounts prefix-less (`/scan/start`). The
  Worker accepts both `/scan/start` and `/api/scan/start`; the panel uses the
  `/api` form. UI page routes that collide on a first segment (`/sites/<host>`,
  `/route/*`, `/compare/*`, `/history`) are served from the SPA, not the API.

## Tuning (`wrangler.toml`)

- `RATE_LIMITER_CAPACITY` / `RATE_LIMITER_REFILL_PER_SEC` — token bucket per
  (API key | IP). Defaults: 10 / 1 per sec.
- `UNLIGHTHOUSE_CONFIG` — inline config JSON (same schema as the CLI config).
  Only `site` is required; `scan.start` can override the target per request.
- `UNLIGHTHOUSE_USE_MOCK_AUDITOR=1` — escape hatch; bypasses the Container.
- `[[containers]] instance_type` — `standard-1` handles most sites; bump to
  `standard-2` if Lighthouse OOMs on heavy SPAs.
- `[[containers]] max_instances` — caps concurrency/blast radius (5 is fine).
- `[triggers] crons` — R2 TTL sweeper schedule (default hourly).

## Retention (D-044)

Scan history grows without bound by default: every scan writes raw LHR + a
reconciled report + screenshots per route per device. Two complementary controls
keep R2 (and D1) from filling up:

1. **Application retention (authoritative).** Set a `retention` policy in
   `UNLIGHTHOUSE_CONFIG` (same schema as the CLI). `pruneScans` runs over the
   Storage port, so it deletes both the D1 scan rows and the namespaced R2 blobs
   (`scans/<id>/**`) oldest-first per site:

   ```jsonc
   {
     "site": "https://example.com",
     "retention": {
       "maxScansPerSite": 30,   // keep the 30 newest scans per site
       "maxAgeDays": 90,        // and drop anything older than 90 days
       "keepCiBaselines": true  // never prune a scan used as a comparison baseline
     }
   }
   ```

   Agents / CI invoke it explicitly with `history.prune` (POST `/api/history/prune`,
   `{ "dryRun": true }` to preview). The CLI host also runs it automatically after
   each scan; on the Worker, call `history.prune` from your cron or after a scan.

2. **R2 lifecycle rule (belt-and-braces).** As a backstop against orphaned blobs
   (e.g. a scan row deleted out-of-band), add an R2 object-lifecycle rule so R2
   expires objects even if application pruning never runs:

   ```sh
   # Expire every object under scans/ 90 days after creation.
   wrangler r2 bucket lifecycle add unlighthouse \
     --prefix "scans/" --expire-days 90
   # Inspect / remove:
   wrangler r2 bucket lifecycle list unlighthouse
   ```

   Or in the dashboard: **R2 → your bucket → Settings → Object lifecycle rules →
   Add rule**, prefix `scans/`, "Delete objects" after N days. Keep the lifecycle
   window ≥ your `maxAgeDays` so R2 never deletes blobs the app still tracks.

## Cost (rough, ~100 audits/day)

- Workers Paid: $5/mo flat
- Browser Rendering: ~$3/mo (within the included browser-hours)
- Container: ~$7/mo (standard instance, scales to zero when idle)
- **Total ≈ $15/mo**

## Observability

```sh
wrangler tail        # live logs (Worker + Container)
```

The sweeper logs `[r2-sweeper] scanned=N deleted=M` per cron run. The Container
logs `[LighthouseContainer] started/stopped`.

## Tear-down

```sh
wrangler delete                          # removes the Worker + Container
wrangler d1 delete unlighthouse          # removes the D1 database
wrangler r2 bucket delete unlighthouse   # removes the R2 bucket
```

## Maintainer runbook — verifying command-surface parity on a real deploy (D-035)

Automated coverage: `packages/cloudflare/test/d1-storage.test.ts` exercises the
real `d1R2Storage` (raw-SQL scan/route/pack repos + the shared drizzle-orm/d1
reports/comparisons repos) against better-sqlite3 wearing the D1 interface. That
proves the SQL and the drizzle code path, but not the workerd runtime. A real
miniflare/workerd integration test is the tracked follow-up; until it lands, a
maintainer confirms parity on an actual deploy once per release:

1. Deploy (`wrangler deploy`) and apply the D1 schema. Fresh databases are
   bootstrapped by `migrate(env.DB)` (idempotent `CREATE TABLE IF NOT EXISTS`);
   for a managed migration history run
   `wrangler d1 migrations apply <db> --remote` against
   `packages/core/migrations/sqlite`.
2. Run a scan end-to-end and confirm it reaches `complete` with a populated
   `summary` and pack rows:
   - `curl -sX POST $WORKER/api/scan.start -d '{"site":"https://example.com"}'`
   - poll `curl -s "$WORKER/api/scan.status?scanId=<id>"` until `complete`.
3. Dashboard detail: `curl -s "$WORKER/api/scan.results?scanId=<id>"` returns
   route rows.
4. pack.run drill-in: `curl -s "$WORKER/api/pack.run" -d '{"scanId":"<id>","pack":"overview"}'`
   returns a report (`cache: "miss"` first, `"hit"` on the second call).
5. compare.*: run a second scan, then
   `curl -s "$WORKER/api/compare.run" -d '{"baseScanId":"<id1>","currentScanId":"<id2>"}'`
   returns regressions/improvements.
6. Optional persist path: the comparison + CrUX tables (`comparisons`,
   `comparison_diffs`, `scan_crux`) are created by `migrate` and read through the
   shared drizzle repositories; they populate on demand (CI comparison writes,
   CrUX enrichment) and are otherwise empty by design.

This deploy verification is maintainer-owned: the implementing agent does not
run a live Cloudflare deploy.
