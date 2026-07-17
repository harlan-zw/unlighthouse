# Cloudflare app

This is the maintained Cloudflare composition root for Unlighthouse. It owns
deployment policy and Cloudflare resources; reusable crawling, auditing,
storage, and command behavior stay in workspace packages.

The app serves a polling dashboard and same-origin API, stores relational data
in D1 and large artifacts in R2, rate-limits through a Durable Object, and runs
real Lighthouse through PageSpeed Insights with a Cloudflare Container
fallback. Multi-page scans run as a Cloudflare Workflow; production never
installs the mock auditor.

Worker implementation lives under `src/`; workerd integration tests live under
`test/`. The app root is reserved for Wrangler/Vitest configuration, scripts,
local environment templates, and this deployment runbook.

Prerequisites are Node.js 24.13.1 or newer, pnpm, and a Workers Paid account:
the app deploys a Container and configures the Workflow above the free-plan
step limit. Local container builds also require Docker; the manual GitHub
Actions workflow can build and deploy it on an `ubuntu-latest` runner instead.

## Secure defaults

- `workers.dev` and preview URLs are disabled. `routes` is intentionally empty
  until an operator chooses a custom domain.
- The Worker runs before every static asset, so the dashboard and API share the
  same authentication boundary.
- API clients use `Authorization: Bearer <token>`. Browsers can use HTTP Basic
  with username `unlighthouse` and the same token as the password; the browser
  credential prompt then covers same-origin asset and API requests.
- Scan targets must match `UNLIGHTHOUSE_ALLOWED_ORIGINS` exactly. Literal
  loopback, link-local, private, `.local`, and `.internal` targets are rejected
  even if accidentally listed.
- Durable audit delegation uses a named service-binding entrypoint. It does not
  expose a token-authenticated callback URL.
- `/health` is intentionally unauthenticated for deployment probes. It does not
  expose secrets or scan data.

## Provision and configure

From `apps/cloudflare`:

```sh
wrangler login
wrangler d1 create unlighthouse
wrangler r2 bucket create unlighthouse
```

Update [wrangler.jsonc](./wrangler.jsonc):

1. Replace the D1 `database_id`.
2. Replace `CF_ACCOUNT_ID`.
3. Set `UNLIGHTHOUSE_CONFIG.site` and `UNLIGHTHOUSE_ALLOWED_ORIGINS`. The
   latter is a comma-separated list of exact origins, including non-default
   ports when needed.
4. Add a route. For a custom domain:

   ```jsonc
   "routes": [
     { "pattern": "unlighthouse.example.com", "custom_domain": true }
   ]
   ```

The production secret contract is explicit:

```sh
wrangler secret put UNLIGHTHOUSE_API_TOKEN   # openssl rand -hex 32
wrangler secret put SHARED_AUDIT_TOKEN       # a different random token
wrangler secret put CF_BROWSER_RUN_TOKEN     # Browser Rendering: Edit scope
```

Optional Google keys are intentionally not in `secrets.required` because
Wrangler cannot express optional secrets there:

```sh
wrangler secret put PSI_API_KEY   # raises PSI quota
wrangler secret put CRUX_API_KEY  # enables the CrUX fallback tier
```

For local development, copy `.dev.vars.example` to `.dev.vars` and fill in
local values. Never commit `.dev.vars`.

The default rate limit permits a two-scan burst and then refills one scan per
minute. Tune `RATE_LIMITER_CAPACITY` and `RATE_LIMITER_REFILL_PER_SEC` in
`wrangler.jsonc` for your audit budget; these guard expensive scan starts, not
ordinary dashboard reads.

## Data lifecycle

D1 schema changes are deployment migrations, not request-time DDL:

```sh
pnpm db:migrate:local
pnpm db:migrate:remote
```

`pnpm deploy` applies remote migrations before uploading the Worker. The daily
cron invokes core retention, which coordinates D1 scan rows and their
namespaced R2 blobs. Keep the `retention` block in `UNLIGHTHOUSE_CONFIG` tuned
to your volume.

Avoid an independent R2 expiry rule unless you intentionally want a hard blob
age cap. A bucket rule cannot see D1's retained CI baselines and can therefore
delete artifacts that application retention still tracks. The old hourly
bucket sweeper was removed for the same reason.

## Develop, verify, and deploy

Build workspace packages before typechecking this app so its package exports
are current.

```sh
pnpm types          # regenerate Env from wrangler.jsonc
pnpm typecheck      # also verifies generated Env is current
pnpm test           # Vitest inside workerd
pnpm build:panel
pnpm deploy:dry-run
pnpm dev
pnpm deploy
```

The generated binding interface is committed as `src/worker-configuration.d.ts`.
Provider keys are the only app-local optional augmentation because Wrangler's
required-secret schema has no optional form.

Verify an authenticated deployment:

```sh
export APP=https://unlighthouse.example.com
export UNLIGHTHOUSE_API_TOKEN=...

curl -fsS "$APP/health"
curl -fsS -H "Authorization: Bearer $UNLIGHTHOUSE_API_TOKEN" "$APP/api/manifest"
curl -fsS -X POST \
  -H "Authorization: Bearer $UNLIGHTHOUSE_API_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"site":"https://example.com","device":["mobile"]}' \
  "$APP/api/scan/start"
```

For the dashboard, open `$APP` and enter `unlighthouse` plus the API token in
the browser's credential prompt. The maintained app deliberately uses polling;
it does not provision an unused WebSocket fanout object.

## Operations

Workers Logs and sampled traces are enabled in `wrangler.jsonc`. Use
`pnpm tail` for live diagnostics. Logs must contain structured operational
context, never credentials or complete request bodies.

Durable Object migration history is append-only. Do not edit or reorder tags
that have already shipped; add a new tag for every class change.

The scan Workflow is package-owned and the binding is app-owned. Its durable
steps retain only small URL/counter outputs; Lighthouse artifacts remain in
D1/R2. The queue is capped at 200 routes and the binding permits 1,024 steps;
the worst-case scan stays below that ceiling without placing artifacts in
Workflow state.
Pause, resume, and termination use native Workflow controls and immediately
mirror status to D1 for the polling dashboard.
