# Unlighthouse on Cloudflare Containers

Runs `unlighthouse serve` from the repository's `Dockerfile` in one [Cloudflare Container](https://developers.cloudflare.com/containers/) behind a Worker. The container sleeps when idle, so you pay only while someone uses the dashboard or a scan runs.

```
browser / API ──▶ Worker `unlighthouse` ──(valid token only)──▶ Container (bun + Chromium, unlighthouse serve :5678)
                    │  cron */5                                │
                    │  reads state.json, wakes if a           │ http://unlighthouse.sync  (outbound handler,
                    │  schedule is due                         ▼  runs in the Worker with the R2 binding)
                    └──────────────────────────────────▶ R2 bucket `unlighthouse-data`
                                                          unlighthouse.db.gz, blobs/<scan>/…, state.json
```

## How it works

- **One instance.** `getContainer(env.UNLIGHTHOUSE)` always addresses the same Durable Object, and `max_instances` is 1, so there is exactly one Unlighthouse process and one SQLite writer. Unlighthouse runs one scan at a time anyway.
- **Instance type.** `standard-2` (1 vCPU, 6 GiB, 12 GB disk). The image is about 1.9 GB.
- **Sleep.** `sleepAfter` is 5 minutes. Every request through the Worker resets the timer. When it runs out, `onActivityExpired()` asks Unlighthouse whether a scan is `queued`, `discovering` or `auditing` (`scans.list`). If one is, the container stays awake and is checked again 5 minutes later. If not, `stop()` sends `SIGTERM`. Unlighthouse then stops cleanly and uploads its data before it exits (Cloudflare waits up to 15 minutes before `SIGKILL`).
- **Persistence (`UNLIGHTHOUSE_SYNC`).** The container disk is wiped on every stop. With `UNLIGHTHOUSE_SYNC=<base URL>`, `unlighthouse serve`:
  - on start, downloads `unlighthouse.db.gz` before it opens the database, then downloads `blobs/` in the background;
  - after every scan that finishes (`done`, `failed`, `cancelled`), 30 s after the last audited page (so a long scan is saved page by page, and so is a page rescan), and on shutdown, writes a consistent copy with `VACUUM INTO`, gzips it and uploads it. It also uploads new or changed blob files, deletes remote blobs that were deleted locally, and writes `state.json` (`{ syncedAt, nextRunAt }`).

  The store is plain HTTP: `GET|PUT|DELETE <base>/<key>` and `GET <base>/?prefix=<p>` returning `{ "keys": [...] }`, with `Authorization: Bearer $UNLIGHTHOUSE_SYNC_TOKEN`. Here the base is `http://unlighthouse.sync`. The Container class's `outboundByHost` handler catches that hostname and serves it from the R2 binding, so the container holds no R2 credentials. SQLite never runs on R2 through FUSE, because FUSE does not give SQLite working locks.
- **Auth.** The Worker checks Unlighthouse's own token before it forwards anything: `Authorization: Bearer`, the `unlighthouse_token_5678` cookie, or `?token=`. Requests without a valid token get a 401 (an HTML token form for browsers) and never wake the container. Unlighthouse checks the token a second time, and the cookie flow is unchanged: `/?token=…` sets an `HttpOnly`, `SameSite=Strict` cookie and redirects. The Worker passes the same token to the container as `UNLIGHTHOUSE_TOKEN` and `UNLIGHTHOUSE_SYNC_TOKEN`.
- **Scheduled scans.** Unlighthouse's schedules live in its database. The Worker's cron trigger (`*/5 * * * *`) reads `state.json` from R2 (one Class B read) and wakes the container only when `nextRunAt` is due. On start, Unlighthouse's scheduler runs every schedule whose time has passed. A schedule therefore starts at most about 5 minutes late. The wake call also runs `schedules.list` as a check.

### Trade-offs

- A crash or host loss (anything that skips `SIGTERM`) loses changes made since the last upload, which is at most the pages audited in the last half minute or so. API-only changes (such as a new schedule or a deleted scan) are uploaded on the next scan or on shutdown.
- A cold start downloads the whole database before it serves, and blobs arrive in the background. Opening a Lighthouse report from an old scan right after a cold start can return 404 for a few seconds.
- Exactly one writer is guaranteed only by `max_instances: 1` plus the single Durable Object name. Do not point a second Unlighthouse at the same bucket.
- Unlighthouse prints its login URL, which includes the token, to stdout, and container logs go to Workers Logs. Anyone with access to the account's logs can read the token.

## Setup

Requirements: a Workers Paid plan, Docker running locally (`wrangler deploy` builds the image), and Bun.

```sh
cd deploy/cloudflare
bun install --frozen-lockfile
bunx wrangler r2 bucket create unlighthouse-data
```

Set `vars.PUBLIC_HOST` in `wrangler.jsonc` to the hostname you will use (`unlighthouse.<your-subdomain>.workers.dev` or a custom domain). Unlighthouse rejects every other `Host` header.

Generate a token, store it in a file only you can read, and deploy with it as a Worker secret:

```sh
umask 077
bun -e "process.stdout.write(Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url'))" > ~/.cloudflare-unlighthouse-token
printf 'UNLIGHTHOUSE_TOKEN=%s\n' "$(cat ~/.cloudflare-unlighthouse-token)" > /tmp/unlighthouse.secrets.env
bunx wrangler deploy --secrets-file /tmp/unlighthouse.secrets.env
rm /tmp/unlighthouse.secrets.env
```

The first deploy provisions the container application. Until provisioning finishes, requests get a 503 for a few minutes. Later deploys keep the secret. To rotate the token, run `bunx wrangler secret put UNLIGHTHOUSE_TOKEN`. The running container keeps the old token until it next sleeps.

Open `https://<PUBLIC_HOST>/` and paste the token, or open `/?token=<token>` once. For API calls, send `Authorization: Bearer <token>` and `POST /api/<operation>`.

`bun run check` regenerates `worker-configuration.d.ts` and typechecks the Worker.

### Cloudflare Access (outer layer)

Cloudflare Access sits in front of the token check, so a visitor has to sign in with an allowed email before the token form appears. A self-hosted Access application on the `PUBLIC_HOST` domain (24 h session) with two policies works well:

- `owner`: Allow for your email (for example `hi@productdevbook.com`), signing in with a one-time PIN sent by email.
- `api service token`: Service Auth for a service token (valid for one year), for scripts.

Create it in Zero Trust › Access › Applications › Add › Self-hosted, or with `POST /accounts/{account_id}/access/apps`. Use a hostname application, not the Worker-level "Protect this Worker" switch: Worker-level Access rejects WebSocket upgrades, and the dashboard's live progress uses `/ws`.

Access does not replace the token. Unlighthouse still needs it, so a browser signs in to Access and then enters the token once. A script sends all three headers:

```sh
curl -X POST https://<PUBLIC_HOST>/api/scans.list \
  -H "CF-Access-Client-Id: $CF_ACCESS_CLIENT_ID" -H "CF-Access-Client-Secret: $CF_ACCESS_CLIENT_SECRET" \
  -H "Authorization: Bearer $UNLIGHTHOUSE_TOKEN" -d '{}'
```

The cron trigger and the container's R2 traffic do not pass through Access. To remove Access, delete the application. The Worker's token check keeps working without it.

## Costs

Prices from the Cloudflare docs, 2026-10. The Workers Paid plan ($5/month) includes, each month, 25 GiB-hours of container memory, 375 vCPU-minutes and 200 GB-hours of disk.

| While the container runs (`standard-2`) | Rate | Per hour |
|---|---|---|
| Memory, 6 GiB provisioned | $0.0000025 / GiB-s | $0.054 |
| CPU, billed on use (1 vCPU flat out) | $0.000020 / vCPU-s | up to $0.072 |
| Disk, 12 GB provisioned | $0.00000007 / GB-s | $0.003 |

A sleeping container costs nothing. The included memory covers about 4 hours of awake time per month. Example: one daily scheduled scan of ~6 minutes, plus boot and the 5-minute idle tail, is ~12 minutes a day, ~6 hours a month: about $0.10 above the plan. Each visit to the dashboard keeps the container up for at least 5 minutes after the last request.

Measured on this deployment (2026-10-03). A cold start, from the request until Unlighthouse answered with the database restored, took 2.1 s. That is with the image already cached; the first deploy needs a few minutes of provisioning, and requests get a 503 until it finishes. One page of example.com took 13 s. unlighthouse.dev, with 6 pages audited out of 146 discovered and 3 samples each, took 317 s. The database plus blobs of these scans take 1.3 MB in R2.

R2 (Standard): $0.015 / GB-month after 10 GB free, Class A (PUT, LIST) $4.50 / million after 1 million free, Class B (GET) $0.36 / million after 10 million free, no egress fees. A scan uploads its new blobs plus three small objects. The cron makes about 8,600 Class B reads a month. Both stay inside the free tier for normal use.

Workers requests and the Durable Object that controls the container are billed under the Workers Paid plan. Their volume here is tiny.

## Limits

- One scan at a time on 1 vCPU. Performance scores on a shared 1 vCPU instance are noisier than on a dedicated machine. Unlighthouse records the benchmark index with every page.
- Schedules run up to ~5 minutes late (the cron interval), and Unlighthouse requires schedules to be at least 15 minutes apart.
- Container disk is 12 GB. The image (~1.9 GB) and all blobs restored on start must fit on it.
- Container images count toward the account's 50 GB image storage. Delete old ones with `wrangler containers images delete`.
- Lighthouse audits run from Cloudflare's network, so a target site's bot protection may treat them differently from a browser at home.
