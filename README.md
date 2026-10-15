# Unlighthouse

Unlighthouse scans a whole website with Lighthouse, groups pages by URL template, merges the same problem found on many pages into one issue, and keeps every scan so two runs can be compared. A dashboard, a CLI, a CI gate, a static report and an MCP server for AI agents all sit on the same engine.

## Relation to Unlighthouse v1

This repository is a from-scratch take on the goals of [Unlighthouse](https://github.com/harlan-zw/unlighthouse) v1, written as input for the [v1 branch](https://github.com/harlan-zw/unlighthouse/tree/v1). The approach was discussed with [Harlan Wilton](https://github.com/harlan-zw), the author of Unlighthouse, together with the Unlighthouse project. It is not an official Unlighthouse release; for that, see [unlighthouse.dev](https://unlighthouse.dev) and the [Unlighthouse repository](https://github.com/harlan-zw/unlighthouse).

What it explores for v1:

- a single Bun package instead of a multi-package monorepo, with few dependencies and no build step;
- issues deduplicated across pages and URL templates inferred automatically;
- recorded measurement conditions, so unreliable performance scores are flagged;
- one operation registry behind the dashboard, HTTP API, CLI and MCP server.

## Why

- **Lighthouse 13 native.** Unlighthouse runs Lighthouse 13.5 directly and reads category and audit ids from the installed version, including the new agentic-browsing category. Lighthouse CI is still on 12.x.
- **The whole site, not one URL.** Discovery reads `robots.txt`, sitemaps (indexes, gzip) and links, optionally rendering client-side apps in Chrome. You see what was found, sampled, skipped and broken.
- **Templates.** URLs are grouped into patterns such as `/blog/*` or `/products/*/reviews`. Unlighthouse audits a sample per template instead of thousands of copies, and reports which template regressed.
- **Deduplicated issues.** One oversized hero image failing on 312 pages is one issue with 312 affected pages, ranked by impact.
- **Honest numbers.** Every page records its Lighthouse version, benchmark index, throttling, concurrency and sample spread. Results measured on a slow or busy machine are flagged, not hidden. Concurrency defaults to a level that keeps performance scores stable.
- **Mobile and desktop in one run**, compared against the previous scan with a noise threshold.
- **CI.** `unlighthouse ci` checks budgets (scores, metrics, regressions, new issues), writes Markdown, JSON and JUnit, and exits non-zero on failure. A GitHub Action wraps it.
- **Shareable.** `unlighthouse export` writes a self-contained folder that opens from disk or any static host.
- **MCP.** AI agents can start scans and drill from a summary down to single findings.
- **Never hangs.** Each Lighthouse run gets its own process and Chrome, a hard timeout and a process-tree kill.

## Install

Unlighthouse needs Chrome or Chromium, and either a release archive or [Bun](https://bun.com) ≥ 1.4.

### Release archive (no Bun needed)

Each [release](https://github.com/productdevbook/unlighthouse/releases) has `unlighthouse-<os>-<arch>.tar.gz` for `linux-x64`, `linux-arm64`, `darwin-arm64`, `darwin-x64` and `windows-x64`:

```sh
curl -fsSL https://github.com/productdevbook/unlighthouse/releases/latest/download/unlighthouse-linux-x64.tar.gz | tar -xz
unlighthouse-linux-x64/unlighthouse doctor
```

The archive holds the `unlighthouse` binary (Unlighthouse, the Bun runtime and the dashboard) and a `lib/` folder with Lighthouse and the packages it loads at run time. Keep `lib/` next to the binary; to put `unlighthouse` on your `PATH`, symlink the binary instead of copying it alone. `bun run build` builds every archive into `dist/` (`bun run build linux-x64` builds one); pushing a `v*` tag builds them in [`.github/workflows/release.yml`](.github/workflows/release.yml) and attaches them to a GitHub release.

### From source

```sh
git clone https://github.com/productdevbook/unlighthouse.git unlighthouse
cd unlighthouse
bun install --frozen-lockfile
bun src/cli.ts doctor        # checks Chrome, Bun, Lighthouse and the data directory
```

Chrome is found through `CHROME_PATH`, the `chromePath` option or the usual install locations. `bunx @puppeteer/browsers install chrome@stable` installs Chrome for Testing when none is present. In the examples below, `unlighthouse` stands for `bun /path/to/unlighthouse/src/cli.ts`.

### Docker

```sh
docker build -t unlighthouse .
docker run --rm --init --shm-size=1g -v "$PWD:/data" unlighthouse scan https://example.com
```

The image is `oven/bun:1.4.2-debian` with Debian's Chromium and fonts, runs as the non-root `bun` user, works in `/data` (config file, `.unlighthouse` data and exports all land in the mounted folder) and sets `UNLIGHTHOUSE_NO_SANDBOX=1`, because Docker's default seccomp profile blocks the user namespaces Chrome's sandbox needs. [`docker/run.sh`](docker/run.sh) adds hardening: read-only root with tmpfs, `--cap-drop ALL`, `no-new-privileges`, a pids and memory limit, and the dashboard port bound to `127.0.0.1`:

```sh
docker/run.sh scan https://example.com
docker/run.sh serve --host 0.0.0.0     # reachable only at http://127.0.0.1:5678 on the host
```

[`deploy/cloudflare`](deploy/cloudflare/README.md) runs the same image on Cloudflare Containers, scaled to zero when idle, with the data kept in R2 through `UNLIGHTHOUSE_SYNC`.

## Quick start

```sh
unlighthouse scan https://example.com --device mobile,desktop
unlighthouse serve                     # dashboard on http://127.0.0.1:5678 (open the printed URL with its token)
unlighthouse export <scanId>           # ./unlighthouse-report/index.html
```

A config file `unlighthouse.config.ts` in the working directory is loaded automatically; flags override it:

```ts
export default {
  site: 'https://example.com',
  devices: ['mobile', 'desktop'],
  discover: { exclude: ['/admin/**'] },
  sampling: { perTemplate: 3 },
  budgets: {
    scores: { performance: 0.8, accessibility: 0.95 },
    metrics: { lcp: 4000 },
    regression: { performance: 0.05 },
    newIssues: 0,
  },
}
```

`unlighthouse config --print` shows the resolved config.

## Config reference

Generated from the zod schema with `bun run config-docs`.

| Key | Type | Default | Description |
|---|---|---|---|
| `site` | URL |  | Site to scan (http or https) |
| `devices` | ("mobile" \| "desktop")[] | `["mobile"]` |  |
| `categories` | ("performance" \| "accessibility" \| "best-practices" \| "seo" \| "agentic-browsing")[] | `["performance","accessibility","best-practices","seo","agentic-browsing"]` |  |
| `throttling` | "simulate" \| "devtools" \| "none" | `"simulate"` | simulate: Lighthouse default; devtools: real throttling; none: raw machine speed |
| `concurrency` | integer 1–32 |  | Parallel Lighthouse runs; defaults to a value that keeps performance scores stable |
| `samples` | integer 1–9 | `1` | Runs per page; the median run is kept |
| `timeoutMs` | integer ≥ 10000 | `90000` |  |
| `retries` | integer 0–5 | `1` |  |
| `urls` | string[] | `[]` | Explicit paths or URLs; disables discovery when set |
| `discover` | object |  |  |
| `discover.robots` | boolean | `true` |  |
| `discover.sitemap` | boolean | `true` |  |
| `discover.links` | boolean | `true` |  |
| `discover.render` | boolean | `false` | Render pages in Chrome before reading links (client-rendered sites) |
| `discover.maxPages` | integer ≥ 1 | `500` |  |
| `discover.maxDepth` | integer ≥ 0 | `8` |  |
| `discover.include` | string[] | `[]` | Path globs to keep, e.g. /blog/** |
| `discover.exclude` | string[] | `[]` | Path globs to drop |
| `discover.keepQuery` | string[] | `[]` | Query parameters that make a page distinct |
| `discover.locales` | "default" \| "all" \| string[] | `"default"` | Languages to audit on multilingual sites: default (primary/x-default language only; other language versions are listed as skipped alternates), all, or a list of locale codes such as ["en", "tr"] |
| `sampling` | object |  |  |
| `sampling.perTemplate` | integer ≥ 0 | `5` | Pages audited per template; 0 audits all |
| `sampling.maxAudits` | integer ≥ 1 | `300` | Upper bound on audited pages per device |
| `templates` | string[] | `[]` | Known URL patterns, e.g. /blog/:slug, used before inference |
| `auth` | object |  |  |
| `auth.headers` | Record<string, string> | `{}` |  |
| `auth.cookies` | object[] | `[]` |  |
| `auth.localStorage` | Record<string, string> | `{}` |  |
| `auth.sessionStorage` | Record<string, string> | `{}` |  |
| `auth.login` | string |  | Module whose default export logs in with a Puppeteer page |
| `budgets` | object |  |  |
| `budgets.scores` | Record<"performance" \| "accessibility" \| "best-practices" \| "seo" \| "agentic-browsing", number 0–1> | `{}` | Minimum average score per category, 0-1 |
| `budgets.metrics` | Record<"fcp" \| "lcp" \| "tbt" \| "cls" \| "si" \| "ttfb", number> | `{}` | Maximum value per lab metric on any page (ms, CLS unitless) |
| `budgets.templates` | object[] | `[]` | Score and metric budgets for the pages of one template or path glob |
| `budgets.regression` | Record<"performance" \| "accessibility" \| "best-practices" \| "seo" \| "agentic-browsing", number 0–1> | `{}` | Maximum allowed drop of the average category score against the baseline |
| `budgets.newIssues` | integer ≥ 0 |  | Maximum number of issues that are new since the baseline |
| `budgets.field` | Record<"lcp" \| "inp" \| "cls" \| "fcp" \| "ttfb", number> | `{}` | Maximum CrUX field p75 per metric for the origin, per device (ms, CLS unitless); needs crux.enabled |
| `budgets.flows` | Record<string, object> | `{}` | Budgets per user flow name, checked on each of its steps |
| `crux` | object |  |  |
| `crux.enabled` | boolean | `false` | Fetch Chrome UX Report field data (p75 LCP, INP, CLS, FCP, TTFB) after auditing |
| `crux.apiKeyEnv` | string | `"CRUX_API_KEY"` | Environment variable holding the CrUX API key |
| `crux.history` | boolean | `false` | Also fetch the weekly origin trend from the CrUX History API |
| `flows` | object[] | `[]` | User flows run after the page audits; config file only |
| `userAgent` | string |  |  |
| `chromePath` | string |  |  |
| `chromeFlags` | string[] | `[]` |  |
| `lighthouse` | object |  |  |
| `lighthouse.skipAudits` | string[] |  | Audit ids Lighthouse skips |
| `lighthouse.onlyAudits` | string[] |  | Run only these audits (Lighthouse --only-audits); category scores then cover only them |
| `lighthouse.plugins` | string[] |  | Lighthouse plugin packages (lighthouse-plugin-*), resolved from the project directory. Plugins run their own code in every audit; install only ones you trust. Config file only. |
| `lighthouse.settings` | Record<string, unknown> |  | Merged into the Lighthouse config settings; Unlighthouse's own options (categories, throttling, userAgent) take precedence. Config file only. |
| `runner` | unknown | `{"type":"local"}` | Where Lighthouse runs: local Chrome (default), the PageSpeed Insights API (psi) or a remote Chrome over CDP (cdp). Remote performance scores are not comparable with local lab runs. |
| `dataDir` | string | `".unlighthouse"` |  |
| `schedules` | object[] |  | Scans that `unlighthouse serve` runs on a cron schedule |
| `notifications` | object[] |  | Webhook, Slack or Discord messages sent after scans |
| `publicUrl` | URL |  | Dashboard URL used for links in notifications |

`auth.cookies` items are `{ name, value, domain?, path? }`. `auth.login` points at a module whose default export receives a Puppeteer `page`; it runs once per scan and its cookies and storage are reused for every audit.

`lighthouse` passes options through to Lighthouse. Audit ids are checked against the installed Lighthouse (an unknown id fails with the closest match). `lighthouse.plugins` are npm package names (`lighthouse-plugin-*`) resolved from your project directory, not from Unlighthouse's own `node_modules`; **a plugin is code that runs inside every audit**, so install only plugins you trust. Their categories are added to the run and their failing audits become findings without a Unlighthouse category. `plugins` and `settings` are read from the config file only; `scans.start` over the API or MCP ignores them, like `chromePath`.

`runner` chooses where Lighthouse runs:

- `{ type: 'local' }` (default): a local Chrome per audit.
- `{ type: 'psi', apiKeyEnv?, endpoint?, maxRetries?, backoffMs? }`: the PageSpeed Insights v5 API; no Chrome needed. The key is read from the environment variable named by `apiKeyEnv` (default `PSI_API_KEY`). The device picks the PSI strategy. HTTP 429 backs off (`Retry-After`, else `backoffMs` doubling) up to `maxRetries` times, then the page fails with a quota message. PSI audits the public page with its own Lighthouse configuration, so auth and `lighthouse` options are refused.
- `{ type: 'cdp', endpoint, headers? }`: a remote Chrome (browserless, Cloudflare Browser Rendering) reached through a `ws(s)://` browser endpoint or an `http(s)://` DevTools URL; `headers` go with the connection. Auth is applied as with a local Chrome.

Pages measured by `psi` or `cdp` carry `provenance.runner`, and the summary warns (`remote-runner`) that their performance scores are not comparable with local lab runs. The runner is read from the config file only; endpoint credentials and headers are redacted from scans returned by the API.

## CLI reference

| Command | Purpose |
|---|---|
| `scan <url>` | Discover and audit a site, then print a summary |
| `serve` | Dashboard and API (`--port`, default 5678; `--host`, default 127.0.0.1; `--allow-host <name>`) |
| `ci <url>` | Scan, compare with the baseline, check budgets; `--markdown`, `--json`, `--junit`, `--export <dir>`, `--budgets <file>`, `--branch`, `--commit`, `--baseline-branch`. Exit 0 pass, 1 budget failure, 2 scan failure |
| `compare <base> <head>` | Diff two scans (JSON, or Markdown with `--markdown`) |
| `export <scan>` | Static report folder (`--out <dir>`, default `./unlighthouse-report`; `--no-reports` leaves out the per-page Lighthouse HTML) |
| `doctor` | Check Chrome, Bun, Lighthouse and the data directory |
| `prune --keep <n>` | Keep the newest n finished scans per site; running and queued scans and, with n ≥ 1, the latest done scan (the CI baseline) are never removed (`--site <url>` for one site) |
| `config --print` | Print the resolved config |
| `mcp` | MCP server on stdio |

Common options: `-c, --config <file>`, `--data-dir <dir>`, `--json`. Scan options for `scan`, `ci` and `config`: `-d, --device`, `--url` (repeatable; skips discovery), `--max-pages`, `--per-template`, `--max-audits`, `--samples`, `--concurrency`, `--throttling`, `--category`, `--include`, `--exclude`, `--render`, `--label`. `unlighthouse --help` prints everything.

### Static export

`unlighthouse export <scan>` writes `index.html`, `data.js` (the scan, summary, every page and finding, issues, templates, broken links and the comparison with its baseline), `assets/` `reports/` (one Lighthouse HTML report per audited page) and `thumbs/` (one WebP thumbnail per audited page and device, listed in `data.js` as `thumbnails`). All paths are relative and routing uses the URL hash, so the folder works from `file://` and from any sub-path of any static host. Filtering, sorting and paging run in the browser; actions that change data are hidden. Unlighthouse only replaces an output folder that is empty or holds a previous export (it carries `.unlighthouse-export.json` and nothing else); any other folder is refused.

### CI

See [docs/ci.md](docs/ci.md) for the GitHub Action (`action.yml`) and other CI systems.

## MCP

`unlighthouse mcp` speaks MCP over stdio. Every operation is a tool: agents start at `scans.summary` and drill down with `issues.list`, `pages.list`, `pages.get` and `compare`, or start scans with `scans.start` and `scans.wait`. Use an absolute `--data-dir` so the agent sees the same scans as your CLI.

Claude Code:

```sh
claude mcp add unlighthouse -- bun /path/to/unlighthouse/src/cli.ts mcp --data-dir /path/to/project/.unlighthouse
```

Cursor (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "unlighthouse": {
      "command": "bun",
      "args": ["/path/to/unlighthouse/src/cli.ts", "mcp", "--data-dir", "/path/to/project/.unlighthouse"]
    }
  }
}
```

## Security model

- **Local server.** `unlighthouse serve` binds to `127.0.0.1`, rejects `Host` headers other than loopback names, IP addresses and `--allow-host` names (DNS rebinding), rejects cross-origin API and WebSocket requests, and requires a random session token for every request (`?token=` once, then an `HttpOnly`, `SameSite=Strict` cookie, or `Authorization: Bearer`). `UNLIGHTHOUSE_TOKEN` fixes the token. Binding to another interface prints a warning.
- **Reports.** Lighthouse HTML reports are served with a `sandbox` CSP, so a report's scripts cannot reach the API. Page thumbnails (`/thumb/<scan>/<device>?url=`) need the same token.
- **Plugins and runners.** Lighthouse plugins run their own code in every audit and are loaded from the config file only, as are Lighthouse settings and the runner; the API and MCP ignore them.
- **Secrets.** Auth headers are sent only to the scanned host (and its www/apex twin), never to third-party requests, and are kept out of stored Lighthouse reports. Auth headers, cookie values and storage values are redacted from scans returned by the API, the MCP server and static exports.
- **Chrome.** Every audit runs in a child process with its own Chrome and profile, a hard timeout and a process-group kill. Chrome keeps its sandbox unless you run as root or set `UNLIGHTHOUSE_NO_SANDBOX=1` (as the Docker image and the GitHub Action do).
- **Supply chain.** Few dependencies, pinned exactly, lockfile installed with `--frozen-lockfile`; `trustedDependencies` is empty, so no dependency install scripts run.
- **Exports are public data.** A static export contains every audited URL, finding and full Lighthouse report of the scan; share it like the site's own content.

## Data layout

```
.unlighthouse/
  unlighthouse.db                          SQLite (WAL): sites, scans, pages, findings
  blobs/<scan>/<hash>-<device>.json.gz   raw Lighthouse reports (gzip)
  blobs/<scan>/<hash>-<device>.webp      page thumbnail from the final screenshot
  scanner.lock                       held while a scanner process uses the directory
unlighthouse-report/                       unlighthouse export
  index.html  data.js  assets/  reports/  thumbs/  .unlighthouse-export.json
```

`unlighthouse prune --keep <n>` drops old scans and their blobs. Schema changes are applied as numbered migrations when the database is opened.

## License

MIT
