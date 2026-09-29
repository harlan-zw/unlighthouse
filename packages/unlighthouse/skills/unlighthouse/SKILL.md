---
name: unlighthouse
description: Run Google Lighthouse on every page of a site with the unlighthouse CLI, and fail CI on low scores with unlighthouse-ci. Use when a task mentions unlighthouse, unlighthouse-ci, site-wide Lighthouse scans, performance budgets in CI, unlighthouse.config.ts, defineUnlighthouseConfig, scanner.exclude, dynamic sampling, the authenticate hook, or a scan that never exits, skips pages, or deletes the .unlighthouse folder.
---

# unlighthouse

Tested against `unlighthouse` 0.18.2 on Node 24 (requires Node `>=22.18.0`).
The package finds the URLs of a site and runs Lighthouse on each one in parallel Chrome instances.
It ships two binaries: `unlighthouse` opens a live dashboard, and `unlighthouse-ci` exits with a status code. Docs: https://unlighthouse.dev

## Setup

```bash
npx unlighthouse-ci --site https://example.com --budget 80
```

- Install `unlighthouse` for both binaries. `@unlighthouse/cli` ships only `unlighthouse-ci`.
- Do not install `puppeteer`. `puppeteer-cluster` already depends on it.
- Chrome: the package uses the system Chrome. If there is none, it downloads Chrome to `~/.unlighthouse`. As root, it adds `--no-sandbox` itself.
- Add `.unlighthouse` to `.gitignore`.
- `@unlighthouse/nuxt`, `@unlighthouse/vite`, and `@unlighthouse/webpack` are deprecated. Run the CLI against the dev server URL instead.
- The config file is `unlighthouse.config.ts` in the current directory. CLI flags win over the config file.

## Pick the binary

- **`unlighthouse-ci`** scans, writes reports, and exits. Exit code 1 means a budget failed or the scan found no routes. Use it in scripts, CI, and Agent runs.
- **`unlighthouse`** starts a dashboard server (port 5678 by default), opens a browser, and keeps running after the scan. It never exits by itself.

## Automatic behaviour

- **URL discovery:** `urls` if set, else robots.txt, then sitemap.xml, then a crawler that follows links from the home page. Robots.txt `Disallow` lines become excludes.
- **`--urls` or `urls`** turns off robots.txt, sitemap, crawler, and sampling. The paths are relative to `site`.
- **A `site` with a path**, such as `https://example.com/docs`, turns off sitemap, robots.txt, and sampling.
- **A sitemap with 50 or more URLs** turns off the crawler, except on `localhost`.
- **Dynamic sampling** scans at most 8 random URLs per route group, such as `/blog/*`. The docs say 5. Turn it off with `--disable-dynamic-sampling`.
- **`scanner.maxRoutes`** (200) stops the queue. It logs a warning and exits 0.
- **HTML inspection skips JavaScript.** If the home page has no links, the crawler turns JavaScript on and retries. For an SPA, pass `--enable-javascript`.
- **Device** is mobile. Pass `--desktop` for desktop.

## Common tasks

Per category budgets, reporters, and scope in one config:

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  site: 'https://staging.example.com',
  scanner: {
    exclude: ['/admin/**', '/api/**'],
    include: ['/', /^\/blog\//, '/docs/**'], // keep '/' so the crawler can start
  },
  ci: {
    budget: { 'performance': 70, 'accessibility': 95, 'best-practices': 90, 'seo': 90 },
    reporter: 'jsonExpanded',
  },
})
```

- Budgets use 0 to 100. Report scores use 0 to 1. A budget of 80 fails a score of 0.79.
- Reporters: `json` (default), `jsonExpanded`, `csv`, `csvExpanded`, `lighthouseServer`. The file is `<outputPath>/ci-result.json` or `ci-result.csv`.
- `lighthouseServer` needs `--lhci-host` and `--lhci-build-token`.

Static HTML report: pass `--build-static`. It writes `index.html` to the root of `outputPath` (`.unlighthouse`), not to a `client` folder. Upload that folder. It deletes the per page `lighthouse.json` files.

Authentication: the `authenticate` hook gets the Puppeteer `Page` as its first argument. It runs once, and its cookies and storage apply to every page.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  auth: { username: 'admin', password: process.env.AUTH_PASS! },
  hooks: {
    async authenticate(page) {
      await page.goto('https://example.com/login')
      await page.type('input[name="email"]', 'test@example.com')
      await Promise.all([page.waitForNavigation(), page.click('button[type="submit"]')])
    },
  },
})
```

Read scores in a hook: `task-complete` fires once per task. `categories` is an array.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  hooks: {
    'task-complete': (path, report, taskName) => {
      if (taskName !== 'runLighthouseTask')
        return
      // the type omits `key`, but each category has it at runtime
      const categories = report.report?.categories as { key: string, score: number | null }[] | undefined
      console.log(path, report.report?.score, categories?.find(c => c.key === 'performance')?.score)
    },
  },
})
```

Programmatic scan: pass the `ci` provider and call `setCiContext()` before `start()`.

```ts
import { createUnlighthouse } from 'unlighthouse'

const unlighthouse = await createUnlighthouse({ site: 'https://example.com', urls: ['/'] }, { name: 'ci' })
unlighthouse.hooks.hook('worker-finished', () => {
  console.log(unlighthouse.worker.reports().map(r => [r.route.path, r.report?.score]))
  process.exit(0)
})
await unlighthouse.setCiContext()
await unlighthouse.start()
```

## Traps

- **`unlighthouse-ci` deletes `outputPath` before it scans.** Never set `--output-path` to a folder that holds other files, such as `.` or `dist`.
- **`scanner.throttle: false` does not turn off throttling in 0.18.2.** Every scan uses simulated throttling. To turn it off, set `lighthouseOptions.throttlingMethod: 'provided'`.
- **`cache: false` in the config has no effect on `unlighthouse`.** Pass `--no-cache`. `unlighthouse-ci` never uses the cache.
- **`ci.buildStatic: true` in the config has no effect.** Pass `--build-static`.
- **String patterns are route patterns, not regex.** `--exclude-urls "/blog/.*"` excludes nothing. Use `/blog/**`, or a `RegExp` in the config.
- **`--cookies` and `--extra-headers` cut each value at its second `=`.** `sid=abc=def` sends `sid=abc`. Put base64 tokens in the config `cookies` and `extraHeaders`.
- **`authenticate({ page })` from the docs crashes the scan.** The hook gets `page` itself.
- **`report.score.performance` from the docs crashes the scan.** A hook that throws stops `unlighthouse-ci` with exit code 1.
- **`createUnlighthouse(config)` without a provider throws on `start()`.** Use the programmatic form above.
- **`unlighthouse.worker.cluster.close()` throws `this.display.close is not a function`.** Exit the process, or catch the error.
- **An `include` list that skips `/` hangs a crawler scan.** The home page is filtered out, nothing is queued, and `unlighthouse-ci` never exits. Add `'/'` to `include`, or use `--urls`.
- **Dynamic sampling is random.** Two runs can scan different pages in one group. For stable CI results, pass `--urls` or turn sampling off.

## Output

- `unlighthouse-ci`: `.unlighthouse/ci-result.json` and `.unlighthouse/reports/<path>/lighthouse.json`.
- `unlighthouse`: `.unlighthouse/<host>/<config hash>/`. A config change starts a new cache folder.

## Config

- `scanner.device` (`'mobile'`), `scanner.samples` (1, runs per page, averaged).
- `scanner.dynamicSampling` (8), `scanner.maxRoutes` (200), `scanner.crawler`, `scanner.sitemap`, `scanner.robotsTxt`.
- `puppeteerClusterOptions.maxConcurrency` (half the CPU cores). Set 1 for stable performance scores.
- `lighthouseOptions` passes through to Lighthouse. `onlyAudits` replaces `onlyCategories`.
- `chrome.useSystem`, `chrome.downloadFallbackCacheDir`.
- All options: https://unlighthouse.dev/api-doc/config

## Debug

- `--debug` logs the resolved config. A route that `include` or `exclude` drops logs `Skipping route based on include / exclude rules`.
- "Failed to queue routes for scanning" means discovery found nothing. Check the `site` status and the robots.txt `Disallow` lines.
