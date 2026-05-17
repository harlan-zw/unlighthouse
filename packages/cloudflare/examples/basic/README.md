# Unlighthouse on Cloudflare — minimal deploy

End-to-end deploy of the `@unlighthouse/cloudflare` preset. Three files,
three commands. Once it's up, `POST /api/scan/start` kicks off a real
scan against the configured site; results stream to D1 + R2 + Durable
Object WebSocket subscribers.

## Prerequisites

- Cloudflare account with Workers + D1 + R2 + Browser Rendering enabled.
  (Browser Rendering is on the Workers Paid plan, $5/mo.)
- `wrangler` ≥ 4 installed locally (`pnpm i -g wrangler`, or use
  `pnpm dlx wrangler …`).
- `wrangler login` once per machine.

## Setup

```sh
# 1. Provision the D1 database. Copy the `database_id` it prints into
#    wrangler.toml under [[d1_databases]].
wrangler d1 create unlighthouse

# 2. Provision the R2 bucket.
wrangler r2 bucket create unlighthouse

# 3. Edit wrangler.toml:
#    - paste the database_id
#    - replace UNLIGHTHOUSE_CONFIG's site with your real target
#    - bump UNLIGHTHOUSE_VERSION on each deploy

# 4. Install deps.
pnpm install
```

## Deploy

```sh
pnpm deploy
```

The first deploy installs the two Durable Object classes
(`ScanEventsDO`, `RateLimiterDO`) — wrangler prints the migration step
inline. The D1 schema is applied in-process on first request via the
package's `INIT_SQL_STATEMENTS`, so there's no separate
`wrangler d1 migrations apply` step.

## Verify

```sh
# Health check. Returns { ok: true, version, uptimeMs, storage, activeScans }.
curl https://<your-worker>.workers.dev/api/health

# Manifest — every command, hook, error code. Useful as a smoke test
# that the HTTP projection mounted everything correctly.
curl https://<your-worker>.workers.dev/api/manifest

# Start a scan. The rate limiter gates this endpoint per
# (x-api-key | cf-connecting-ip); a fresh deploy starts with 10 tokens.
curl -X POST https://<your-worker>.workers.dev/api/scan/start \
  -H 'content-type: application/json' \
  -d '{"site": "https://your-target.com"}'

# Subscribe to the scan's event stream over WebSocket. Send a filter
# frame as the first message (omit it to receive every event).
wscat -c "wss://<your-worker>.workers.dev/api/events/subscribe?scanId=<id>"
> {"events": ["scan:route-complete", "scan:complete"]}
```

## Tuning

`wrangler.toml` carries every knob:

- `RATE_LIMITER_CAPACITY` / `RATE_LIMITER_REFILL_PER_SEC` — token bucket
  per (API key | IP). Defaults are 10 / 1 per sec.
- `UNLIGHTHOUSE_CONFIG` — full inline config JSON. Same schema as the
  CLI's `unlighthouse.config.ts`. Only `site` is required.
- `UNLIGHTHOUSE_USE_MOCK_AUDITOR=1` — escape hatch for smoke-testing
  the wiring without hitting Browser Rendering.
- `[triggers] crons` — when the R2 TTL sweeper runs. Default hourly;
  daily is fine for most setups.

## Observability

```sh
wrangler tail        # live logs from every Worker invocation
```

The sweeper logs `[r2-sweeper] scanned=N deleted=M` on each cron run.
Storage adapters log writes through the Worker's tagged logger
(`unlighthouse/storage/*`).

## Tear-down

```sh
wrangler delete                                # removes the Worker
wrangler d1 delete unlighthouse                # removes the D1 database
wrangler r2 bucket delete unlighthouse         # removes the R2 bucket
```
