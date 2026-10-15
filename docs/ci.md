# Unlighthouse in CI

`unlighthouse ci <url>` scans a site, compares it with the latest finished scan of the same site and devices (preferring the base branch), checks budgets and writes reports. Exit codes: `0` pass, `1` budget failure, `2` scan failure.

The repository root is a composite GitHub Action that wraps it. Pin a commit instead of `main` for reproducible builds.

## GitHub Actions

```yaml
name: Unlighthouse
on:
  pull_request:
  push:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v7

      # Earlier scans make the comparison and the regression budgets work.
      - uses: actions/cache@v6
        with:
          path: .unlighthouse
          key: unlighthouse-${{ github.run_id }}
          restore-keys: unlighthouse-

      - uses: productdevbook/unlighthouse@main
        with:
          url: https://preview.example.com
          devices: mobile,desktop
          budgets: .github/unlighthouse-budgets.json
          fail-on-budget: 'true'
          args: --per-template 3 --max-pages 300
```

`.github/unlighthouse-budgets.json` has the shape of the `budgets` config key:

```json
{
  "scores": { "performance": 0.8, "accessibility": 0.95 },
  "metrics": { "lcp": 4000, "cls": 0.1 },
  "regression": { "performance": 0.05 },
  "newIssues": 0,
  "templates": [
    { "match": "/blog/*", "scores": { "performance": 0.7 }, "metrics": { "lcp": 3000 } },
    { "match": "/checkout/**", "device": "mobile", "metrics": { "tbt": 300 } }
  ]
}
```

`templates` entries apply to the pages whose template equals `match` or whose path matches it as a glob, per device (`device` limits it to one). Scores are the mean over those pages, metrics the worst page. Results are scoped `template:<match>/<device>`; a budget with no matching pages is skipped.

### What the action does

1. Installs Bun 1.4.2 (`oven-sh/setup-bun`).
2. Uses the runner's Chrome (`CHROME_PATH`, `google-chrome`, `chromium`); installs Chrome stable with `browser-actions/setup-chrome` only when none is found.
3. Installs Unlighthouse's production dependencies from its lockfile (`bun install --frozen-lockfile --production`).
4. Runs `unlighthouse ci` with Markdown, JSON, JUnit and the static report (`--export`). The Markdown is appended to `$GITHUB_STEP_SUMMARY`, so it shows on the run page.
5. Uploads one artifact (`unlighthouse-report` by default): `unlighthouse.md`, `unlighthouse.json`, `unlighthouse.junit.xml` and `report/` (open `report/index.html`, no server needed). The upload runs even when budgets fail.
6. Fails the step on a scan failure, and on a budget failure unless `fail-on-budget` is `false`.

### Inputs

| Input | Default | Meaning |
|---|---|---|
| `url` | required | Site to scan |
| `devices` | config (mobile) | `mobile`, `desktop` or `mobile,desktop` |
| `config` | `unlighthouse.config.ts` if present | Config file path |
| `budgets` | none | JSON budgets file; replaces `budgets` from the config |
| `fail-on-budget` | `true` | Fail the step when a budget fails |
| `data-dir` | `.unlighthouse` | Data directory; cache it to keep history |
| `no-sandbox` | `true` | Launch Chrome with `--no-sandbox` (hosted Ubuntu 24.04 runners block Chrome's sandbox through AppArmor) |
| `working-directory` | `.` | Where config and relative paths resolve |
| `artifact-name` | `unlighthouse-report` | Name of the uploaded artifact |
| `args` | none | Extra `unlighthouse ci` flags, split on spaces |

Outputs: `exit-code` (0, 1 or 2) and `report-dir`.

### Branches and baselines

`unlighthouse ci` records `GITHUB_HEAD_REF`/`GITHUB_REF_NAME` as the branch and `GITHUB_SHA` as the commit. On pull requests it prefers a baseline from `GITHUB_BASE_REF`, so a scan of `main` (from the `push` trigger above) is the reference for every PR. Without a cached `.unlighthouse` there is no baseline: absolute budgets still apply, regression and new-issue budgets are skipped.

### Performance numbers on shared runners

Hosted runners are small, shared VMs. Unlighthouse records the benchmark index and flags results measured on a slow or busy machine; keep `concurrency` unset (the default allows one Lighthouse run per 6 CPU cores, so one run on a hosted runner) and treat small performance changes with care. Accessibility, SEO, best practices and agentic-browsing scores do not depend on machine speed.

## Other CI systems

Any runner with Bun ≥ 1.4 and Chrome works:

```sh
bun install --frozen-lockfile --production
bun src/cli.ts ci https://preview.example.com \
  --device mobile,desktop \
  --budgets budgets.json \
  --markdown unlighthouse.md --json unlighthouse.json --junit unlighthouse.junit.xml \
  --export unlighthouse-report
```

Or use the Docker image (see the README): `docker run --rm -v "$PWD:/data" unlighthouse ci https://preview.example.com --export unlighthouse-report`.
