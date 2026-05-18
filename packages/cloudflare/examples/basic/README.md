# Unlighthouse on Cloudflare — minimal deploy

End-to-end deploy of the `@unlighthouse/cloudflare` preset with real
Lighthouse running in a Cloudflare Container driving Browser Run remotely.
Once it's up, `POST /api/scan/start` kicks off a real scan against the
configured site; results stream to D1 + R2 + Durable Object WebSocket
subscribers.

## Architecture

```
Worker (HTTP, D1, R2, DOs, WS fanout, cron sweeper)
  │ env.LIGHTHOUSE_CONTAINER.getByName('default').fetch('/audit', ...)
  ▼
LighthouseContainer (Node 22 image, ~250 MB, no Chromium)
  │ puppeteer.connect to wss://api.cloudflare.com/.../browser-rendering/...
  ▼
Browser Run (managed Chromium on Cloudflare's edge)
```

The Worker never touches `lighthouse` (it can't — `fileURLToPath(import.meta.url)`
crashes in the Workers runtime). The Container does the Lighthouse work
and talks to Cloudflare-hosted Chromium over CDP.

## Prerequisites

- Cloudflare Workers **Paid** plan (Containers + Browser Run both require it; $5/mo).
- `wrangler` ≥ 4 installed locally.
- `wrangler login` once per machine.

## Setup

```sh
# 1. Provision D1. Paste the database_id into wrangler.toml.
wrangler d1 create unlighthouse

# 2. Provision R2.
wrangler r2 bucket create unlighthouse

# 3. Set secrets (Wrangler stores them encrypted; not in wrangler.toml):
wrangler secret put SHARED_AUDIT_TOKEN       # random 32 bytes, e.g. `openssl rand -hex 32`
wrangler secret put CF_ACCOUNT_ID            # your Cloudflare account ID
wrangler secret put CF_BROWSER_RUN_TOKEN     # API token, scope: Browser Rendering - Edit
wrangler secret put CRUX_API_KEY             # optional; enables CrUX fallback

# 4. Edit wrangler.toml:
#    - paste the database_id
#    - replace UNLIGHTHOUSE_CONFIG's site with your real target
#    - bump UNLIGHTHOUSE_VERSION on each deploy

# 5. Install deps.
pnpm install
```

## Deploy

```sh
pnpm deploy
```

`wrangler deploy` builds + pushes the Container image, then deploys the
Worker. The DO migrations run automatically (`v1` for ScanEvents +
RateLimiter, `v2` for LighthouseContainer). The D1 schema is applied
in-process on first request — no separate `wrangler d1 migrations apply`.

## Verify

```sh
WORKER=https://<your-worker>.workers.dev

# 1. Health — proves the Worker is up.
curl $WORKER/api/health
# → { ok: true, version: "1.0.0-rc.2", uptimeMs, storage, activeScans }

# 2. Kick a scan. Watch wrangler tail in another terminal — you should
#    see the Container boot ("LighthouseContainer started"), then h3's
#    "[cloudflare-lighthouse] listening on :8080".
SCAN=$(curl -fsS -X POST $WORKER/api/scan/start \
  -H 'content-type: application/json' \
  -d '{"site":"https://example.com"}' | jq -r .scanId)
echo "scanId=$SCAN"

# 3. Poll until done (status: completed).
while [ "$(curl -fsS "$WORKER/api/scan/status?scanId=$SCAN" | jq -r .status)" != "completed" ]; do
  sleep 5
done

# 4. Inspect the LHR — `performance.score` is a non-null number 0..1
#    when real Lighthouse ran. Mock returns null.
curl -fsS "$WORKER/api/scan/results?scanId=$SCAN" \
  | jq '.routes[0].extracted.categories.performance.score'
# → 0.92  (or similar — NOT null)

curl -fsS "$WORKER/api/scan/results?scanId=$SCAN" \
  | jq '.routes[0].extracted.categories | keys'
# → ["accessibility","best-practices","performance","seo"]
```

## Fallback verification

The `auditorFactory` wires `fallbackAuditor([container, crux?, mock])`.
To prove the cascade works:

```sh
# Find the running Container instance and force-stop it.
wrangler containers instances list
wrangler containers instances stop <id> --force

# Re-run the scan. wrangler tail should show:
#   "container-lighthouse failed: ECONNREFUSED"
#   "trying next auditor: crux"  (if CRUX_API_KEY was set)
# or fall through to mock if no CRUX key.
```

## Tuning

`wrangler.toml` knobs:

- `RATE_LIMITER_CAPACITY` / `RATE_LIMITER_REFILL_PER_SEC` — token bucket
  per (API key | IP). Defaults: 10 / 1 per sec.
- `UNLIGHTHOUSE_CONFIG` — full inline config JSON (same schema as the
  CLI's `unlighthouse.config.ts`). Only `site` is required.
- `UNLIGHTHOUSE_USE_MOCK_AUDITOR=1` — escape hatch; bypasses the Container.
- `[[containers]] instance_type` — `standard` (1 GiB / 0.5 vCPU) handles
  most sites. Bump to `standard-2` if Lighthouse OOMs on heavy SPAs.
- `[[containers]] max_instances` — caps blast radius. 5 is fine for v1.
- `[triggers] crons` — R2 TTL sweeper schedule. Default hourly.

## Cost (rough)

For 100 audits/day:
- Workers Paid: $5/mo flat
- Browser Run: ~$3/mo (audits stay under the included 10 browser-hours/mo)
- Container: ~$7/mo (standard instance, 5-10h/day active, scales to zero)
- **Total ≈ $15/mo**

## Observability

```sh
wrangler tail        # live logs (Worker + Container)
```

The sweeper logs `[r2-sweeper] scanned=N deleted=M` on each cron run.
The Container logs `[LighthouseContainer] started/stopped` and h3's
`[cloudflare-lighthouse] listening on :8080`.

## Tear-down

```sh
wrangler delete                                # removes the Worker + Container
wrangler d1 delete unlighthouse                # removes the D1 database
wrangler r2 bucket delete unlighthouse         # removes the R2 bucket
```

## Risks (read once before first deploy)

- **Worker → Container fetch may exceed 60s.** Workers have no documented
  subrequest timeout while the client is connected, but if you see
  truncated audits, swap the container API to 2-phase
  (`POST /audit/start → jobId`, `GET /result/:jobId` polled via
  `ctx.waitUntil`).
- **Browser Run CDP command compatibility.** Cloudflare's CDP has been
  "plain CDP" since June 2026. If Lighthouse's `Emulation.*` or
  `Network.*` calls get blocked, the perf score will be null — fall
  back to disabling the `performance` category in cdp-connect.
- **Cold start ~3-5s** after the Container goes to sleep
  (`sleepAfter = '10m'`). First request after idle pays the boot.
- **`fallbackAuditor` capability AND-down.** Mock advertises
  `reliablePerfScores: false`, so the composed router does too. Strip
  mock from the fallback list in production once the Container is stable.
