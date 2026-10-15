# Unlighthouse — research: user demand and ecosystem (2026-10-02)

Scope: a site-wide Lighthouse scanner (Bun + TypeScript) in the spirit of [harlan-zw/unlighthouse](https://github.com/harlan-zw/unlighthouse).
Part 1 is mined from issue trackers with the `gh` CLI (reaction counts = sum of all reaction types at fetch time, `c` = comments).
Part 2 is ecosystem news verified against release notes, npm and the installed packages.

Ground-truth versions installed in this repo: `lighthouse` 13.5.0, `puppeteer-core` 25.12.0, `zod` 4.6.5, Bun 1.4.2.

---

## Part 1 — What users ask for and complain about

### Data sets

| Tracker | Issues pulled | Notes |
|---|---|---|
| harlan-zw/unlighthouse | all 224 issues + 25 discussions | low reaction counts overall (max 16); comments are the better signal |
| GoogleChrome/lighthouse-ci | all 597 issues | last release v0.15.1 on 2025-06-26 ([releases](https://github.com/GoogleChrome/lighthouse-ci/releases)) |
| GoogleChrome/lighthouse | top 100 by reactions + top 150 created since 2025-01-01 | |
| sitespeed.io, lighthouse-parade, treosh/lighthouse-ci-action, foo-software/lighthouse-check-action | top 15 by reactions each | |

Unlighthouse status context: the maintainers' tracking issue [unlighthouse#349](https://github.com/harlan-zw/unlighthouse/issues/349) (2026-05-20) says v1 is a "clean multi-package workspace, real Lighthouse, MCP server, 550+ tests" with the `v1.0.0` tag held back; roadmap items are a `@unlighthouse/crux` field-data bridge, a hosted `cloud.unlighthouse.dev`, and Cloudflare deploy polish.

### Theme 1 — Chrome setup, Docker, CI environments (largest pain by volume)

What people want: `npx tool --site X` works on a fresh Linux box, in Docker, in GitHub Actions/GitLab, on WSL2 and ARM, without hunting for Chrome or sandbox flags.

- [unlighthouse#66](https://github.com/harlan-zw/unlighthouse/issues/66) "stuck at Waiting for routes…" — r9 c23 (most-commented unlighthouse issue; silent failure with Chromium on Linux). Duplicate later: [#194](https://github.com/harlan-zw/unlighthouse/issues/194).
- [unlighthouse#16](https://github.com/harlan-zw/unlighthouse/issues/16) "Cannot find module puppeteer" r3 c9; [#261](https://github.com/harlan-zw/unlighthouse/issues/261) "executablePath or channel must be specified for puppeteer-core" c6 (2025); [#247](https://github.com/harlan-zw/unlighthouse/issues/247) CHROME_PATH r2; [#138](https://github.com/harlan-zw/unlighthouse/issues/138) "Running as root without --no-sandbox" r3; [#81](https://github.com/harlan-zw/unlighthouse/issues/81) Docker r2 c5; [#30](https://github.com/harlan-zw/unlighthouse/issues/30) CI stalls; [#272](https://github.com/harlan-zw/unlighthouse/issues/272) CI stuck (2025).
- [lighthouse-ci#164](https://github.com/GoogleChrome/lighthouse-ci/issues/164) "Define a standard docker image" r19 c26; [#761](https://github.com/GoogleChrome/lighthouse-ci/issues/761) WSL2 cannot connect to Chrome r16 (open); [#894](https://github.com/GoogleChrome/lighthouse-ci/issues/894) GH Actions examples missing Chrome install r10 (open); [#1052](https://github.com/GoogleChrome/lighthouse-ci/issues/1052) browser crashes in Docker; [#1134](https://github.com/GoogleChrome/lighthouse-ci/issues/1134) 0.15.1 fails on Debian Trixie ARM (2026-03).
- [treosh/lighthouse-ci-action#116](https://github.com/treosh/lighthouse-ci-action/issues/116) "CHROME_PATH must be set" r7.
- Lighthouse core: [lighthouse#6512](https://github.com/GoogleChrome/lighthouse/issues/6512) ☂ PROTOCOL_TIMEOUT r142 c362 (open since 2018, top reacted issue); [#2784](https://github.com/GoogleChrome/lighthouse/issues/2784) "Unable to load the page" r54; [#6154](https://github.com/GoogleChrome/lighthouse/issues/6154) NO_FCP when tab is in background r20 (open).

Solved upstream? Partially. Unlighthouse closed most as config issues; LHCI never shipped an official image.
Good solution: a `doctor` command that finds/downloads a Chrome (Chrome for Testing), prints the exact failure (sandbox, missing libs, port), an official Docker image, a GitHub Action, and hard timeouts so nothing ever hangs silently.

### Theme 2 — Scan stalls, retries and memory

What people want: a scan that always finishes, skips bad URLs after N tries, and stays within memory on big sites.

- [unlighthouse#268](https://github.com/harlan-zw/unlighthouse/issues/268) failed-retry loops forever (closed 2025-06); [#164](https://github.com/harlan-zw/unlighthouse/issues/164) never finishes when all URLs fail; [#213](https://github.com/harlan-zw/unlighthouse/issues/213)/[#203](https://github.com/harlan-zw/unlighthouse/issues/203) "failed to run performance audits, adding back to queue" c5/c4; [#60](https://github.com/harlan-zw/unlighthouse/issues/60) `--samples 3` → "Cannot create new tab" r6 c13; [#155](https://github.com/harlan-zw/unlighthouse/issues/155) same r2; [#202](https://github.com/harlan-zw/unlighthouse/issues/202)/[#267](https://github.com/harlan-zw/unlighthouse/issues/267) puppeteer `protocolTimeout`; [#121](https://github.com/harlan-zw/unlighthouse/issues/121) EventEmitter leak r5; [#235](https://github.com/harlan-zw/unlighthouse/issues/235) memory leak.
- [lighthouse-ci#1130](https://github.com/GoogleChrome/lighthouse-ci/issues/1130) memory exhaustion even with `--concurrency=1` (2026-02, open); [lighthouse-ci#886](https://github.com/GoogleChrome/lighthouse-ci/issues/886) "Cannot create new tab" r9.
- [lighthouse#16796](https://github.com/GoogleChrome/lighthouse/issues/16796) wait thresholds silently raised for non-simulated runs, making crawls slower than expected (open, 2025-11).

Good solution: per-URL state machine with bounded retries and a terminal `failed` state with reason; one Chrome per worker recycled every N pages; global and per-page deadlines; resumable runs from a persisted queue (SQLite).

### Theme 3 — Score variance and "doesn't match PageSpeed/DevTools"

What people want: numbers they can trust and explain, comparable to PSI and to field data.

- [lighthouse#6708](https://github.com/GoogleChrome/lighthouse/issues/6708) PSI differs from Lighthouse in Chrome r64 c162; [#7017](https://github.com/GoogleChrome/lighthouse/issues/7017) PSI credibility r60; [#5064](https://github.com/GoogleChrome/lighthouse/issues/5064) inconsistent results; [#16539](https://github.com/GoogleChrome/lighthouse/issues/16539) "Lighthouse punishes good asset preloading" r119 c24 (2025-06, open, still active 2026-09 with 13.4.1 data showing simulated LCP ≫ observed and CPU-load-dependent scores).
- [unlighthouse#212](https://github.com/harlan-zw/unlighthouse/issues/212) "Catastrophic score" c8 (open); [#142](https://github.com/harlan-zw/unlighthouse/issues/142), [#149](https://github.com/harlan-zw/unlighthouse/issues/149), [#45](https://github.com/harlan-zw/unlighthouse/issues/45) differs from Chrome; [#131](https://github.com/harlan-zw/unlighthouse/issues/131) desktop throttling doesn't match Lighthouse; [#251](https://github.com/harlan-zw/unlighthouse/issues/251) "Slow 4G on Desktop" label; [#195](https://github.com/harlan-zw/unlighthouse/issues/195) `throttlingMethod` forced to `provided`; [#394](https://github.com/harlan-zw/unlighthouse/issues/394) `screenEmulation` silently overwritten (2026-08); [#376](https://github.com/harlan-zw/unlighthouse/issues/376) column vs report mismatch (2026-05); [D#299](https://github.com/harlan-zw/unlighthouse/discussions/299) show all samples of one URL.
- [lighthouse-ci#475](https://github.com/GoogleChrome/lighthouse-ci/issues/475) too much variance c11; [#400](https://github.com/GoogleChrome/lighthouse-ci/issues/400), [#430](https://github.com/GoogleChrome/lighthouse-ci/issues/430) differs from DevTools; [#1064](https://github.com/GoogleChrome/lighthouse-ci/issues/1064) assertions not against the representative run.

Root causes: concurrency on one host (CPU contention), wrapper tools overriding Lighthouse presets, Lantern simulation artefacts.
Good solution: use the exact upstream presets (`mobileSlow4G`, `desktopDense4G` in the installed lantern constants) unchanged; never override a user's emulation; run N samples and pick the median-run by Lighthouse's own algorithm; default perf concurrency to 1 per CPU-bound slot and record host load; show observed vs simulated values; show CrUX p75 next to lab values.

### Theme 4 — Authentication and pre-scan state

What people want: scan pages behind login using cookies, headers, localStorage/sessionStorage/IndexedDB, or a scripted login, and have the crawler use the same state.

- [lighthouse#1418](https://github.com/GoogleChrome/lighthouse/issues/1418) "How to test page behind authentication?" r26 c47; [lighthouse#16676](https://github.com/GoogleChrome/lighthouse/issues/16676) `extraHeaders` applied to all requests breaks CORS on third-party/CDN assets (open, 2025-09).
- [unlighthouse#64](https://github.com/harlan-zw/unlighthouse/issues/64) r4; [#3](https://github.com/harlan-zw/unlighthouse/issues/3) c5; [#137](https://github.com/harlan-zw/unlighthouse/issues/137) login hook doesn't work c6; [#197](https://github.com/harlan-zw/unlighthouse/issues/197) cookies missing during scan c6; [#223](https://github.com/harlan-zw/unlighthouse/issues/223) crawler ignores extra headers c6; [#182](https://github.com/harlan-zw/unlighthouse/issues/182) localStorage access denied on setCookie; [#292](https://github.com/harlan-zw/unlighthouse/issues/292) sessionStorage (open); [#216](https://github.com/harlan-zw/unlighthouse/issues/216) IndexedDB r3 (open); [#92](https://github.com/harlan-zw/unlighthouse/issues/92) session page errors.
- [lighthouse-ci#58](https://github.com/GoogleChrome/lighthouse-ci/issues/58) set cookies c9; [#1110](https://github.com/GoogleChrome/lighthouse-ci/issues/1110) can't set cookies (2025); [#192](https://github.com/GoogleChrome/lighthouse-ci/issues/192) client-cert auth c34.

Solved upstream? Unlighthouse v1 branch claims localStorage/sessionStorage/IndexedDB injection, "not yet smoke-tested" ([#349](https://github.com/harlan-zw/unlighthouse/issues/349)).
Good solution: one `auth` config used by both crawler and auditor: cookies, headers scoped to the site origin only (avoids #16676), storage seeding via init script, or a login script / recorded storage state run once and reused; a `--auth-check` that verifies a protected URL is not redirected to login.

### Theme 5 — URL discovery: sitemaps, SPA/hash routing, query strings, exclusions, large sites

What people want: find every real route (sitemap index, robots.txt sitemaps, sitemap.txt, links rendered by JS), control the scope with include/exclude, handle query-string and hash routes, and not be capped silently.

- [unlighthouse#84](https://github.com/harlan-zw/unlighthouse/issues/84) only ~200 results c4; [D#162](https://github.com/harlan-zw/unlighthouse/discussions/162) raise maxRoutes; [#47](https://github.com/harlan-zw/unlighthouse/issues/47) multiple sitemaps / from robots.txt r2; [#105](https://github.com/harlan-zw/unlighthouse/issues/105) sitemap.txt; [#108](https://github.com/harlan-zw/unlighthouse/issues/108) sitemap index; [#61](https://github.com/harlan-zw/unlighthouse/issues/61) exclude/regex r2; [#385](https://github.com/harlan-zw/unlighthouse/issues/385) excluding paths does not work (2026-06, open); [#207](https://github.com/harlan-zw/unlighthouse/issues/207) query-string URLs ignored c5; [#257](https://github.com/harlan-zw/unlighthouse/issues/257) Angular hash routing; [#112](https://github.com/harlan-zw/unlighthouse/issues/112) determine URLs via `window.location`; [#154](https://github.com/harlan-zw/unlighthouse/issues/154) not all links detected; [#196](https://github.com/harlan-zw/unlighthouse/issues/196) start from subdirectory; [#297](https://github.com/harlan-zw/unlighthouse/issues/297) CI finds fewer routes than CLI (open); [#284](https://github.com/harlan-zw/unlighthouse/issues/284) no longer crawls all pages; [#215](https://github.com/harlan-zw/unlighthouse/issues/215)/[#184](https://github.com/harlan-zw/unlighthouse/issues/184) x-default/i18n/canonical confusion; [#270](https://github.com/harlan-zw/unlighthouse/issues/270) redirect drops query → Lantern cycle error; [#83](https://github.com/harlan-zw/unlighthouse/issues/83) false redirect detection.
- [lighthouse-parade#52](https://github.com/cloudfour/lighthouse-parade/issues/52) limit scope r4; [#3](https://github.com/cloudfour/lighthouse-parade/issues/3) sitemap support r4.
- [lighthouse-ci#1112](https://github.com/GoogleChrome/lighthouse-ci/issues/1112) extensionless URLs (2025).

Good solution: discovery = sitemap(s) from robots.txt + index + txt, plus HTML link extraction (fast path with `HTMLRewriter`, JS-rendered fallback), explicit include/exclude globs applied to every source, query params kept unless excluded, a report line "found N, sampled M, skipped K (reason)" and template-based sampling that is visible and switchable.

### Theme 6 — Mobile and desktop in one run

- [lighthouse-ci#138](https://github.com/GoogleChrome/lighthouse-ci/issues/138) "How to run for both desktop and mobile?" r64 — top reacted LHCI issue, open since 2019.
- [unlighthouse#120](https://github.com/harlan-zw/unlighthouse/issues/120) (open; v1 claims a device matrix), [#166](https://github.com/harlan-zw/unlighthouse/issues/166) context conflict when starting twice.

Good solution: `devices: ['mobile','desktop']` as a first-class matrix; one report with a device toggle; budgets per device.

### Theme 7 — CI gating, budgets, PR feedback

- [unlighthouse#134](https://github.com/harlan-zw/unlighthouse/issues/134) GitHub Actions support r6 (open); [#63](https://github.com/harlan-zw/unlighthouse/issues/63) scores output for PR comments r2 c8; [D#172](https://github.com/harlan-zw/unlighthouse/discussions/172) run on preview deploys.
- [lighthouse-ci#730](https://github.com/GoogleChrome/lighthouse-ci/issues/730) PR comment instead of status r10 (open); [#859](https://github.com/GoogleChrome/lighthouse-ci/issues/859) status checks not seen; [#950](https://github.com/GoogleChrome/lighthouse-ci/issues/950) retry failed assertions; [#1145](https://github.com/GoogleChrome/lighthouse-ci/issues/1145) `maxLength` counts items, not identity — a fix and a regression cancel out (2026-08, open); [#994](https://github.com/GoogleChrome/lighthouse-ci/issues/994) new assertions giving score 0 after LH upgrade.
- [treosh/lighthouse-ci-action#106](https://github.com/treosh/lighthouse-ci-action/issues/106) job summaries r15; [#71](https://github.com/treosh/lighthouse-ci-action/issues/71) fail if score lowers vs previous run r11; [#41](https://github.com/treosh/lighthouse-ci-action/issues/41) scores as outputs r9.
- [lighthouse#6053](https://github.com/GoogleChrome/lighthouse/issues/6053) performance budgets RFC r42.

Good solution: budgets on category scores, metrics and audit ids per route pattern and device; regression mode vs a stored baseline that diffs failing items by identity (selector/URL), not count; outputs as JSON, JUnit, GitHub job summary and a single updatable PR comment; non-zero exit codes that distinguish "budget failed" from "scanner failed".

### Theme 8 — Reporting, export and sharing

- [unlighthouse#25](https://github.com/harlan-zw/unlighthouse/issues/25) make report deployment easier (open); [D#53](https://github.com/harlan-zw/unlighthouse/discussions/53) full report offline up4; [#199](https://github.com/harlan-zw/unlighthouse/issues/199), [#192](https://github.com/harlan-zw/unlighthouse/issues/192), [#241](https://github.com/harlan-zw/unlighthouse/issues/241), [#244](https://github.com/harlan-zw/unlighthouse/issues/244), [#201](https://github.com/harlan-zw/unlighthouse/issues/201), [#274](https://github.com/harlan-zw/unlighthouse/issues/274), [#11](https://github.com/harlan-zw/unlighthouse/issues/11) relative paths in static reports (7 separate issues); [#208](https://github.com/harlan-zw/unlighthouse/issues/208)/[#245](https://github.com/harlan-zw/unlighthouse/issues/245)/[#275](https://github.com/harlan-zw/unlighthouse/issues/275) broken images/thumbnails; [#290](https://github.com/harlan-zw/unlighthouse/issues/290) homepage missing from static report; [#200](https://github.com/harlan-zw/unlighthouse/issues/200) `--output-path` deletes the target directory; [#65](https://github.com/harlan-zw/unlighthouse/issues/65) export r2; [#135](https://github.com/harlan-zw/unlighthouse/issues/135) CSV docs; [#115](https://github.com/harlan-zw/unlighthouse/issues/115)/[#255](https://github.com/harlan-zw/unlighthouse/issues/255) JSON format; [#98](https://github.com/harlan-zw/unlighthouse/issues/98) full breakdown in export; [#101](https://github.com/harlan-zw/unlighthouse/issues/101) sorting broken; [#24](https://github.com/harlan-zw/unlighthouse/issues/24) filtering; [#375](https://github.com/harlan-zw/unlighthouse/issues/375) LCP column empty (2026-05); [#229](https://github.com/harlan-zw/unlighthouse/issues/229) remove FID column; [D#269](https://github.com/harlan-zw/unlighthouse/discussions/269) byte-weight NaN.
- [lighthouse-ci#1132](https://github.com/GoogleChrome/lighthouse-ci/issues/1132) pages × categories matrix view (2026-02, open); [#142](https://github.com/GoogleChrome/lighthouse-ci/issues/142) filesystem target / file naming c36; [#343](https://github.com/GoogleChrome/lighthouse-ci/issues/343) friendly URL names; [#461](https://github.com/GoogleChrome/lighthouse-ci/issues/461) HTML viewer in server; [#1147](https://github.com/GoogleChrome/lighthouse-ci/issues/1147) multi-byte chars corrupted in LHR (2026-09).
- [lighthouse#7408](https://github.com/GoogleChrome/lighthouse/issues/7408) directory as `--output-path` (open).

Good solution: one self-contained report directory with only relative URLs (works under any sub-path, `file://`, Jenkins iframes), per-URL Lighthouse HTML + JSON, a sortable/filterable pages × categories table, CSV/JSON with a documented schema, and an "issues across the site" view (audit id → affected URLs). Never `rm -rf` a user path.

### Theme 9 — History, comparison and scheduled monitoring

- [unlighthouse#20](https://github.com/harlan-zw/unlighthouse/issues/20) make runs comparable c3 (closed 2026-05); [#141](https://github.com/harlan-zw/unlighthouse/issues/141) CSV → Google Sheets + history (open); [#227](https://github.com/harlan-zw/unlighthouse/issues/227) multiple sites in one UI; [D#276](https://github.com/harlan-zw/unlighthouse/discussions/276) dated runs.
- [lighthouse-ci#5](https://github.com/GoogleChrome/lighthouse-ci/issues/5) production monitoring without git c14; [#338](https://github.com/GoogleChrome/lighthouse-ci/issues/338) compare different URLs c14; [#794](https://github.com/GoogleChrome/lighthouse-ci/issues/794) build cleanup, too much space; [#620](https://github.com/GoogleChrome/lighthouse-ci/issues/620) CLS in graphs c16; [#238](https://github.com/GoogleChrome/lighthouse-ci/issues/238) asset KB budget over time.
- [sitespeed.io#987](https://github.com/sitespeedio/sitespeed.io/issues/987) Prometheus export r18 (top sitespeed issue).

Good solution: every run stored (SQLite) with site, git sha/label, device, Lighthouse version; diff any two runs per URL and per audit; retention policy; optional cron; metrics export (Prometheus/OpenMetrics or JSON) rather than a bespoke dashboard server.

### Theme 10 — Extensibility, API and config DX

- [unlighthouse#48](https://github.com/harlan-zw/unlighthouse/issues/48) custom Lighthouse plugins c6 (open); [#153](https://github.com/harlan-zw/unlighthouse/issues/153) programmatic API docs r3 (open); [#106](https://github.com/harlan-zw/unlighthouse/issues/106) programmatic usage c6; [#264](https://github.com/harlan-zw/unlighthouse/issues/264)/[#289](https://github.com/harlan-zw/unlighthouse/issues/289) `defineUnlighthouseConfig` typing; [#300](https://github.com/harlan-zw/unlighthouse/issues/300) `--config-file` ignored (2026-02); [#158](https://github.com/harlan-zw/unlighthouse/issues/158) CLI vs CI config differences; [#386](https://github.com/harlan-zw/unlighthouse/issues/386) "why are there two binaries?" (2026-06, open); [#243](https://github.com/harlan-zw/unlighthouse/issues/243) easier user agent; [#133](https://github.com/harlan-zw/unlighthouse/issues/133) global query param; [#228](https://github.com/harlan-zw/unlighthouse/issues/228) rate limit; [#36](https://github.com/harlan-zw/unlighthouse/issues/36) accessibility-only.
- [lighthouse-ci#346](https://github.com/GoogleChrome/lighthouse-ci/issues/346) typed config r11; [#973](https://github.com/GoogleChrome/lighthouse-ci/issues/973) ESM config r6; [#438](https://github.com/GoogleChrome/lighthouse-ci/issues/438) hooks to modify report data; [#729](https://github.com/GoogleChrome/lighthouse-ci/issues/729) user-flow reports r14.
- [lighthouse#1773](https://github.com/GoogleChrome/lighthouse/issues/1773) TypeScript typings r25; [#2746](https://github.com/GoogleChrome/lighthouse/issues/2746) extra headers r16; [#6392](https://github.com/GoogleChrome/lighthouse/issues/6392) custom audit docs.

Good solution: one binary with subcommands; a single zod-validated config (TS/JSON) with defaults printed by `config --print`; the same options for CLI, CI and API; `onlyCategories`/`onlyAudits`/`skipAudits` and Lighthouse `plugins` passed through untouched; lifecycle hooks (before navigation, after report).

### Theme 11 — Keeping up with Lighthouse, Chrome and security

- [lighthouse-ci#1136](https://github.com/GoogleChrome/lighthouse-ci/issues/1136) "Lighthouse 13 support?" r17 (2026-04, open, no maintainer reply); [#798](https://github.com/GoogleChrome/lighthouse-ci/issues/798) "please release 0.9.1" r30; [#758](https://github.com/GoogleChrome/lighthouse-ci/issues/758) docker tag not released r11; [#1106](https://github.com/GoogleChrome/lighthouse-ci/issues/1106) 12.1 incompatible with Chrome; security: [#1063](https://github.com/GoogleChrome/lighthouse-ci/issues/1063) r9, [#1131](https://github.com/GoogleChrome/lighthouse-ci/issues/1131) r9, [#1088](https://github.com/GoogleChrome/lighthouse-ci/issues/1088), [#1074](https://github.com/GoogleChrome/lighthouse-ci/issues/1074), [#1058](https://github.com/GoogleChrome/lighthouse-ci/issues/1058), [#1114](https://github.com/GoogleChrome/lighthouse-ci/issues/1114), [#1143](https://github.com/GoogleChrome/lighthouse-ci/issues/1143); [#1138](https://github.com/GoogleChrome/lighthouse-ci/issues/1138) unowned `lhci` npm name squatted (2026-04).
- [unlighthouse#396](https://github.com/harlan-zw/unlighthouse/issues/396) vulnerable `extract-zip` r2 (2026-08, open); [#302](https://github.com/harlan-zw/unlighthouse/issues/302) Rollup CVE; [#230](https://github.com/harlan-zw/unlighthouse/issues/230) "Unexpected token 'with'" (Node version / import attributes) r16 — the single most-reacted unlighthouse issue; [#304](https://github.com/harlan-zw/unlighthouse/issues/304) v0.17.8 breaks web UI; [#293](https://github.com/harlan-zw/unlighthouse/issues/293) missing `dist`.
- [treosh/lighthouse-ci-action#139](https://github.com/treosh/lighthouse-ci-action/issues/139) upgrade to LH 12; [foo-software/lighthouse-check-action#126](https://github.com/foo-software/lighthouse-check-action/issues/126) update Lighthouse c11.

Good solution: few dependencies, Lighthouse pinned but bumped fast, a smoke test against real Chrome in CI, a single compiled binary (no runtime npm resolution), and publish provenance.

### Theme 12 — Audit accuracy complaints that a site-wide tool should surface, not hide

- [lighthouse#11049](https://github.com/GoogleChrome/lighthouse/issues/11049) metrics inclusive of assistive technology r114 (open); [#11631](https://github.com/GoogleChrome/lighthouse/issues/11631) SVG explicit width/height r81; [#11593](https://github.com/GoogleChrome/lighthouse/issues/11593) properly-size images too strict r15; [#16579](https://github.com/GoogleChrome/lighthouse/issues/16579) image sizes wrongly flagged r7 (2025, open); [#17080](https://github.com/GoogleChrome/lighthouse/issues/17080) image-delivery insight false flags under DPR>1 (2026-06, open); [#16779](https://github.com/GoogleChrome/lighthouse/issues/16779)/[#16650](https://github.com/GoogleChrome/lighthouse/issues/16650) LCP discovery fetchpriority false positives; [#17081](https://github.com/GoogleChrome/lighthouse/issues/17081) render-blocking as warning; [#17030](https://github.com/GoogleChrome/lighthouse/issues/17030) bring back TTI-like load interactivity (2026-05, open).
- Agentic/robots: [#16776](https://github.com/GoogleChrome/lighthouse/issues/16776) `Content-Signal` robots.txt directive flagged unknown r12 (fixed); [#16983](https://github.com/GoogleChrome/lighthouse/issues/16983) same (2026-04); [#17051](https://github.com/GoogleChrome/lighthouse/issues/17051) llms.txt check fails on BOM (2026-06); [#17082](https://github.com/GoogleChrome/lighthouse/issues/17082) llms.txt fails on PSI due to fetch/cache (2026-06, fixed).
- [lighthouse#12548](https://github.com/GoogleChrome/lighthouse/issues/12548) CO2 footprint audits r36 (closed, not done).

Good solution: show audit-level "affected URL count" so systemic false positives are visible at once; allow per-audit suppressions with a reason that show in the report; keep raw LHR for re-scoring.

### Theme 13 — Field data, SPA soft navigations, user flows

- [lighthouse#14573](https://github.com/GoogleChrome/lighthouse/issues/14573) report perf metrics on soft navigations r3 c12 (open).
- [lighthouse-ci#729](https://github.com/GoogleChrome/lighthouse-ci/issues/729) user flows r14; [lighthouse-ci#1066](https://github.com/GoogleChrome/lighthouse-ci/issues/1066) INP support r5; [lighthouse-parade#118](https://github.com/cloudfour/lighthouse-parade/issues/118) user flows.
- [unlighthouse#349](https://github.com/harlan-zw/unlighthouse/issues/349) roadmap: `@unlighthouse/crux` (field p75 next to lab) — not started; unlighthouse PR [#390](https://github.com/harlan-zw/unlighthouse/issues/390) "enable CrUX caching in production" (2026-07).

Good solution: CrUX API p75 (URL then origin fallback) per page next to lab metrics, cached; INP only from field or from timespan/user flows; optional user-flow steps for key journeys.

### Theme 14 — Zero-install / hosted use

- [unlighthouse#379](https://github.com/harlan-zw/unlighthouse/issues/379) third party built a paste-a-URL hosted entry (2026-06); [#109](https://github.com/harlan-zw/unlighthouse/issues/109) deploy to Cloudflare Pages; [D#87](https://github.com/harlan-zw/unlighthouse/discussions/87) use without Chrome; [D#95](https://github.com/harlan-zw/unlighthouse/discussions/95) behind reverse proxy; [#221](https://github.com/harlan-zw/unlighthouse/issues/221) self-hosted server; [lighthouse-ci#873](https://github.com/GoogleChrome/lighthouse-ci/issues/873) deploy server to Cloudflare Workers; [lighthouse-ci#251](https://github.com/GoogleChrome/lighthouse-ci/issues/251) use PSI API to collect.

Good solution: a pluggable "runner" (local Chrome default; PSI API as a no-Chrome fallback) and a `serve` mode for the report UI.

---

## Part 2 — Ecosystem news (2025–2026)

### Lighthouse (ground truth: installed `lighthouse` 13.5.0)

Release timeline ([releases](https://github.com/GoogleChrome/lighthouse/releases)):

| Version | Date | What matters for Unlighthouse |
|---|---|---|
| [12.0.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v12.0.0) | 2024-04-22 | PWA category removed; `tap-targets` → `target-size`; budgets removed from core |
| [12.1.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v12.1.0) | 2024-06-18 | first-meaningful-paint metric removed |
| [12.4.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v12.4.0) | 2025-02-26 | first hidden "insight" audits (shared with DevTools trace engine) |
| [12.6.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v12.6.0) | 2025-04-28 | report toggle between old audits and insights ([plan](https://developer.chrome.com/blog/moving-lighthouse-to-insights)) |
| [13.0.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.0.0) | 2025-10-10 | audits replaced by insights removed; Node ≥ 22.19; unknown `onlyCategories` is an error; no perf scoring change ([blog](https://developer.chrome.com/blog/lighthouse-13-0)) |
| [13.0.2](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.0.2) | 2026-02-10 | `robots-txt` accepts `Content-Signal`; bundle built for devtools-mcp |
| [13.1.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.1.0) | 2026-04-07 | `baseline` audit (Best Practices → browser compat, weight 0) |
| [13.2.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.2.0) | 2026-05-01 | `agentic-browsing` category + WebMCP audits + llms.txt |
| [13.3.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.3.0) | 2026-05-07 | `agentic-browsing` added to the default config |
| [13.4.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.4.0) | 2026-06-09 | public types entrypoint; `canonical` fixes |
| [13.4.1](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.4.1) | 2026-07-20 | WebMCP gatherers read `document.modelContext`; npm OIDC trusted publishing |
| [13.5.0](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.5.0) | 2026-09-18 | `ard-schema` (Agent Resource Discovery, `/.well-known/ai-catalog.json`); llms.txt + ARD grouped as "agent discovery"; user flows abort pending navigations; plugin category validation |

Removed in 13.0 with no replacement: `first-meaningful-paint`, `font-size`, `no-document-write`, `offscreen-images`, `preload-fonts`, `third-party-facades`, `uses-passive-event-listeners`, `uses-rel-preload` ([13.0.0 notes](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.0.0)). Replaced by insights: e.g. `render-blocking-resources` → `render-blocking-insight`, `uses-long-cache-ttl` → `cache-insight`, `modern-image-formats`/`uses-optimized-images`/`uses-responsive-images` → `image-delivery-insight`, `largest-contentful-paint-element` → `lcp-breakdown-insight`, `critical-request-chains`/`uses-rel-preconnect` → `network-dependency-tree-insight`, `redirects`/`server-response-time`/`uses-text-compression` → `document-latency-insight` ([blog](https://developer.chrome.com/blog/lighthouse-13-0)). Note: some secondary write-ups use older names (`lcp-phases-insight`, `use-cache-insight`, `interaction-to-next-paint-insight`); the installed 13.5.0 ids are `lcp-breakdown-insight`, `cache-insight`, `inp-breakdown-insight`.

Categories and ids in the installed `node_modules/lighthouse/core/config/default-config.js` (13.5.0):

- `performance` (navigation/timespan/snapshot) — scored metrics: `first-contentful-paint` 10, `largest-contentful-paint` 25, `total-blocking-time` 30, `cumulative-layout-shift` 25, `speed-index` 10; `interaction-to-next-paint` weight 0 (timespan only). Insights group: `cache-insight`, `cls-culprits-insight`, `document-latency-insight`, `dom-size-insight`, `duplicated-javascript-insight`, `font-display-insight`, `forced-reflow-insight`, `image-delivery-insight`, `inp-breakdown-insight`, `lcp-breakdown-insight`, `lcp-discovery-insight`, `legacy-javascript-insight`, `modern-http-insight`, `network-dependency-tree-insight`, `render-blocking-insight`, `third-parties-insight`, `viewport-insight`. Diagnostics: `unminified-css`, `unminified-javascript`, `unused-css-rules`, `unused-javascript`, `total-byte-weight`, `user-timings`, `bootup-time`, `mainthread-work-breakdown`, `long-tasks`, `non-composited-animations`, `unsized-images`, `bf-cache`. Hidden: `interactive`, `max-potential-fid`, `network-requests`, `screenshot-thumbnails`, `final-screenshot`, `script-treemap-data`, `resource-summary`, `redirects`, `server-response-time`, `layout-shifts`, … (`slow-css-selector-insight` exists on disk but is not in the default config).
- `accessibility` — 76 refs (axe-core ^4.13), incl. `target-size`, `color-contrast`, `aria-*`, `label`, `link-name`, `image-alt`.
- `best-practices` — 21 refs: `is-on-https`, `redirects-http`, `csp-xss`, `has-hsts`, `origin-isolation`, `clickjacking-mitigation`, `trusted-types-xss`, `paste-preventing-inputs`, `image-aspect-ratio`, `image-size-responsive`, `doctype`, `charset`, `baseline`, `js-libraries`, `deprecations`, `third-party-cookies`, `errors-in-console`, `valid-source-maps`, `inspector-issues`, `geolocation-on-start`, `notification-on-start`.
- `seo` — `is-crawlable`, `document-title`, `meta-description`, `http-status-code`, `link-text`, `crawlable-anchors`, `robots-txt`, `image-alt`, `hreflang`, `canonical`, `structured-data` (manual).
- `agentic-browsing` (navigation/snapshot, `categoryScoreDisplayMode: 'fraction'`, described as under development) — `agent-accessibility-tree`, `webmcp-form-coverage`, `webmcp-registered-tools`, `webmcp-schema-validity`, `cumulative-layout-shift`, `llms-txt`, `ard-schema`.
- Throttling presets: `mobileSlow4G` (RTT 150 ms, 1.6 Mbps, CPU ×4) and `desktopDense4G` (RTT 40 ms, 10 Mbps, CPU ×1) in `@paulirish/trace_engine` lantern constants. `package.json` `engines.node >= 22.19`; depends on `puppeteer-core ^25.9.0`, `chrome-launcher ^1.2.1`.
- CLI flags (from `cli/cli-flags.js`): `--preset`, `--form-factor`, `--screenEmulation`, `--throttling-method`, `--only-categories`, `--only-audits`, `--skip-audits`, `--extra-headers`, `--blocked-url-patterns`, `--disable-storage-reset`, `--disable-full-page-screenshot`, `--max-wait-for-load`, `--gather-mode`/`--audit-mode`, `--plugins`, `--channel`, `--locale`. No new flags in 13.x besides a `--form-factor` wording change.

Upstream bugs in the new category already seen in the wild: [lighthouse#17051](https://github.com/GoogleChrome/lighthouse/issues/17051) (BOM in llms.txt), [#17082](https://github.com/GoogleChrome/lighthouse/issues/17082) (PSI fetch/cache), [#16983](https://github.com/GoogleChrome/lighthouse/issues/16983) (Content-Signal).

### Lighthouse CI — effectively stalled

`@lhci/cli` 0.15.1 (2025-06-26) still depends on `lighthouse` 12.6.1 (`npm view @lhci/cli dependencies.lighthouse`); no Lighthouse 13 support ([lighthouse-ci#1136](https://github.com/GoogleChrome/lighthouse-ci/issues/1136), r17, no maintainer reply) and open security issues ([#1131](https://github.com/GoogleChrome/lighthouse-ci/issues/1131)). This leaves the CI-budgets niche open for a Lighthouse-13-native tool.

### CrUX, PSI

- CrUX API (Feb 2025): LCP image subparts `largest_contentful_paint_image_time_to_first_byte` / `_resource_load_delay` / `_resource_load_duration` / `_element_render_delay`, `largest_contentful_paint_resource_type`, `round_trip_time`; ECT dimension retired in BigQuery ([blog](https://developer.chrome.com/blog/crux-2025-02)). Existing: `navigation_types` ([blog](https://developer.chrome.com/blog/crux-navigation-types)), `form_factors`, `experimental_time_to_first_byte`; form factors PHONE/DESKTOP/TABLET; quota 150 queries/min/project, free ([docs](https://developer.chrome.com/docs/crux/api)).
- CrUX History API: weekly, updated Mondays; `collectionPeriodCount` 1–40, default 25 ([docs](https://developer.chrome.com/docs/crux/history-api)).
- CrUX Dashboard (Looker Studio) deprecated 2025-09-09, connector off after Nov 2025; replacement CrUX Vis on the History API ([blog](https://developer.chrome.com/blog/crux-dashboard-deprecation)). CrUX field data appears in the DevTools Performance panel since March 2025 ([release notes](https://developer.chrome.com/docs/crux/release-notes)); 2026 notes flag an unexplained INP regression (Aug 2026), no schema changes.
- PSI runs Lighthouse 13 since 2025-10-20 ([PSI release notes](https://developers.google.com/speed/docs/insights/release_notes)); agentic-browsing was disabled for PSI API in 13.4.0 and re-enabled in 13.4.1 ([13.4.1](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.4.1)). Not verified which exact 13.x PSI serves today.

### Core Web Vitals

- Thresholds unchanged: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75; INP replaced FID 2024-03-12 ([web.dev](https://web.dev/articles/vitals)).
- Soft navigations: final origin trial Chrome 147–149 ([blog](https://developer.chrome.com/blog/final-soft-navigations-origin-trial)); per Chrome docs shipped by default in Chrome 151 with `soft-navigation` and `interaction-contentful-paint` entry types, CrUX treatment "to be determined" ([docs](https://developer.chrome.com/docs/web-platform/soft-navigations)). DevTools 151 shows soft FCP/LCP markers ([new in 151](https://developer.chrome.com/blog/new-in-devtools-151)). Lighthouse itself still has no soft-navigation metrics ([lighthouse#14573](https://github.com/GoogleChrome/lighthouse/issues/14573), open).
- `web-vitals` 6.2.2 (2026-09-14); v5.0.0 removed `onFID()`; v6.0.0 (2026-07-21) added soft-navigation reporting (`reportSoftNavs`) ([CHANGELOG](https://github.com/GoogleChrome/web-vitals/blob/main/CHANGELOG.md)).

### Chrome DevTools and agent tooling

- `chrome-devtools-mcp` 1.10.1 (2026-09-23): `performance_start_trace` / `performance_stop_trace` / `performance_analyze_insight`, and `lighthouse_audit` (added v0.19.0, 2026-03-05) which covers a11y/SEO/best-practices/agentic-browsing but **not performance**; WebMCP tools behind a flag ([releases](https://github.com/ChromeDevTools/chrome-devtools-mcp/releases), [tool reference](https://github.com/ChromeDevTools/chrome-devtools-mcp/blob/main/docs/tool-reference.md)).
- DevTools AI assistance can use Lighthouse and insights (DevTools 149) ([blog](https://developer.chrome.com/blog/new-in-devtools-149)); DevTools 153/154 add soft-navigation analysis across insights and CPU tier override ([blog](https://developer.chrome.com/blog/new-in-devtools-october-2026)).
- Lighthouse MCP servers are single-URL: [priyankark/lighthouse-mcp](https://github.com/priyankark/lighthouse-mcp) (210★), [danielsogl/lighthouse-mcp-server](https://github.com/danielsogl/lighthouse-mcp-server) (71★); PageSpeed MCP [PhialsBasement/Pagespeed-MCP-Server](https://github.com/PhialsBasement/Pagespeed-MCP-Server) (13★). DebugBear shipped an MCP server ([June 2026 notes](https://www.debugbear.com/changelog/june-2026-release-notes)). Unlighthouse v0.19.0 (2026-09-29) ships an agent skill in the package ([release](https://github.com/harlan-zw/unlighthouse/releases/tag/v0.19.0)); its v1 branch claims an MCP server ([#349](https://github.com/harlan-zw/unlighthouse/issues/349)). No site-wide MCP scanner found.

### MCP spec

- Current revision **2026-07-28** (`/specification/latest` redirects there): stateless protocol (no `initialize`, version/capabilities in each request `_meta`), sessions removed, `server/discover`, multi-round-trip `InputRequiredResult` replaces server-initiated sampling/elicitation, tasks moved to the `io.modelcontextprotocol/tasks` extension ([changelog](https://modelcontextprotocol.io/specification/2026-07-28/changelog)). Previous: [2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25/changelog), [2025-06-18](https://modelcontextprotocol.io/specification/2025-06-18/changelog) (structured tool output).
- TypeScript SDK: v1 line `@modelcontextprotocol/sdk` 1.32.0; v2 split packages (`@modelcontextprotocol/server` etc.) 2.0.0 on 2026-07-27, 2.3.0 on 2026-10-02, supports 2026-07-28 ([releases](https://github.com/modelcontextprotocol/typescript-sdk/releases)).

### WebMCP, llms.txt, ARD

- WebMCP: W3C Web Machine Learning CG draft for pages exposing tools to agents ([spec](https://webmachinelearning.github.io/webmcp/), [repo](https://github.com/webmachinelearning/webmcp)); API is `document.modelContext` (Lighthouse 13.4.1 switched gatherers to it, [notes](https://github.com/GoogleChrome/lighthouse/releases/tag/v13.4.1)); Chrome origin-trial status is reported by secondary sources only (Chrome 149–156) — treat as unverified.
- llms.txt: spec at [llmstxt.org](https://llmstxt.org/) ([repo](https://github.com/AnswerDotAI/llms-txt)); now checked by Lighthouse `llms-txt`. ARD: Lighthouse `ard-schema` reads `/.well-known/ai-catalog.json` (installed `core/gather/gatherers/agentic/ard.js`).

### Bun (installed 1.4.2 = latest, 2026-09-05)

- Bun 1.4.0 (2026-08-20): rewritten in Rust; new `Bun.WebView` (headless browser, WebKit on macOS or installed Chrome/Edge via CDP, `.cdp()` escape hatch), `Bun.cron()` (OS-level cron), `Bun.Image`, `Bun.markdown`, `bun test --parallel`; Playwright runs on Bun incl. `connectOverCDP`; `Bun.serve` routes can serve a directory; `bun build --compile --asset <dir>` embeds folders ([blog](https://bun.com/blog/bun-v1.4), [release](https://github.com/oven-sh/bun/releases/tag/bun-v1.4.0)).
- Earlier, relevant: `Bun.serve` `routes` + HTML imports/full-stack dev server in 1.2.3 ([blog](https://bun.com/blog/bun-v1.2.3)); `Bun.SQL` with SQLite in 1.2.21 ([blog](https://bun.com/blog/bun-v1.2.21)); `Bun.s3` in 1.2 ([blog](https://bun.com/blog/bun-v1.2)); cross-compiled single-file executables since 1.1.5 ([blog](https://bun.com/blog/bun-v1.1.5)); `bun:sqlite`, `HTMLRewriter`, `Bun.spawn`, Workers since 1.0.
- Known risks: [bun#17969](https://github.com/oven-sh/bun/issues/17969) Lighthouse inside `bun build --compile` fails to find its `.json` files (open); [bun#36979](https://github.com/oven-sh/bun/issues/36979) crash running unlighthouse on 1.4.0-canary (open); [bun#4958](https://github.com/oven-sh/bun/issues/4958) function names elided that Lighthouse relies on (fixed 2026-07-24); [bun#30475](https://github.com/oven-sh/bun/issues/30475) WebView orphan Chromium helpers on Linux (open). Lighthouse declares Node ≥ 22.19, so Bun is outside its tested matrix.

### Cloudflare Browser Run (formerly Browser Rendering)

Renamed 2026-04-15 ([changelog](https://developers.cloudflare.com/changelog/post/2026-04-15-br-rename/)); full CDP endpoint usable by any Puppeteer/Playwright client since 2026-04-10 ([changelog](https://developers.cloudflare.com/changelog/post/2026-04-10-browser-rendering-cdp-endpoint/)); REST quick actions incl. `/crawl`, `/links`, `/markdown`, `/screenshot` ([docs](https://developers.cloudflare.com/browser-run/quick-actions/)); paid: 10 h/month included then $0.09/h ([pricing](https://developers.cloudflare.com/browser-run/pricing/)); 60 s default browser timeout ([limits](https://developers.cloudflare.com/browser-run/limits/)). No Lighthouse endpoint; running Lighthouse over its CDP endpoint is untested and lab numbers from shared remote hosts are not comparable to local runs.

### Competitors and adjacent tools

| Tool | Latest | Signal |
|---|---|---|
| [Unlighthouse](https://github.com/harlan-zw/unlighthouse) | `@unlighthouse/core` 0.19.0, 2026-09-29; 4,877★; Node 22 since 0.18.0 | v1 rewrite pending; CrUX bridge and hosted cloud planned ([#349](https://github.com/harlan-zw/unlighthouse/issues/349)) |
| [sitespeed.io](https://github.com/sitespeedio/sitespeed.io) | 42.7.0, 2026-09-11; 5,038★ | active, Grafana/Graphite-centred |
| [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci) | 0.15.1, 2025-06-26; 7,100★ | stalled on LH 12.6.1 |
| [lighthouse-parade](https://github.com/cloudfour/lighthouse-parade) | 3.0.1; 373★ | crawler + CSV |
| [lighthouse-batch](https://github.com/mikestead/lighthouse-batch) | last push 2024-08; 166★ | dormant |
| [site-audit-seo](https://github.com/viasite/site-audit-seo) | pushed 2026-02; 304★ | crawler with Lighthouse |
| DebugBear | commercial, MCP server June 2026 ([notes](https://www.debugbear.com/changelog/june-2026-release-notes)) | monitoring + agent access |

Google offers no site-wide scanner; PSI is single-URL.

---

## Requirements derived for Unlighthouse

### Must

1. **Lighthouse 13.5 native, ids from the installed config** — LHCI is stuck on 12.6.1 and wrappers broke on renamed/removed audits (lighthouse-ci#1136, #994); read category/audit ids from `default-config.js`, never hard-code removed ones.
2. **Zero-surprise Chrome setup + `doctor`** — the largest complaint volume (unlighthouse#66, lighthouse-ci#164, #761); detect/install Chrome, explain sandbox/lib failures, fail loudly.
3. **Never hang: bounded retries, deadlines, terminal failed state** — unlighthouse#268, #164, #60; lighthouse#6512 (r142).
4. **Discovery that is explicit and complete** — sitemap index/robots/txt + links + include/exclude globs applied everywhere + query routes + a "found/sampled/skipped" summary (unlighthouse#84, #385, #207, #297).
5. **Authenticated scans with one auth config for crawler and auditor** — cookies, origin-scoped headers, storage seeding, login script (lighthouse#1418 r26, unlighthouse#197, #223, lighthouse#16676).
6. **Trustworthy numbers** — upstream presets untouched, no silent emulation overrides, N samples with Lighthouse median-run, perf concurrency limited to avoid CPU contention (unlighthouse#131, #394, #212; lighthouse-ci#475; lighthouse#16539).
7. **Mobile + desktop matrix in one run and one report** — top LHCI issue #138 (r64).
8. **CI mode with budgets and correct exit codes** — budgets per route pattern/device, JSON + JUnit + GitHub summary (unlighthouse#134, #63; treosh#106, #41).
9. **Self-contained static report with relative paths** — seven separate unlighthouse issues on paths/thumbnails (#199, #241, #244, #201, #274, #275, #290); never delete user dirs (#200).
10. **Persist runs in `bun:sqlite`** — enables resume, history and diffs without a server.
11. **Agentic-browsing category on by default and visible site-wide** — new in 13.2/13.3/13.5, few tools surface it; llms.txt/ARD are per-origin, so report them once per site, not per page.

### Should

1. **Regression mode vs a baseline with item identity** — lighthouse-ci#1145, treosh#71.
2. **Site-wide "issue → affected URLs" view** — systemic false positives and template bugs show up at once (lighthouse#17080, #16579).
3. **CrUX p75 next to lab per URL (URL → origin fallback, cached, History API trend)** — unlighthouse roadmap item not started; lab/field gap is theme 3.
4. **MCP server over the stored runs** (spec 2026-07-28, SDK v2) — existing Lighthouse MCPs are single-URL and chrome-devtools-mcp excludes performance from `lighthouse_audit`.
5. **Single compiled binary + official Docker image + GitHub Action** — removes Node/npm breakage (unlighthouse#230 r16, #293, #304) — verify bun#17969 first.
6. **One typed config (zod) shared by CLI/CI/API, `config --print`** — unlighthouse#300, #158, #386; lighthouse-ci#346.
7. **CSV/JSON export with a documented schema** — unlighthouse#63, #65, #115, #141.
8. **Pass-through for Lighthouse `plugins`, `onlyCategories`, `skipAudits`** — unlighthouse#48, #36.

### Later

1. **Scheduled monitoring via `Bun.cron()` + OpenMetrics export** — lighthouse-ci#5, sitespeed.io#987; not core to a scanner.
2. **User flows / soft-navigation measurement for key journeys** — Chrome 151 shipped soft navs but Lighthouse has no metric yet (lighthouse#14573).
3. **Remote runners (PSI API, Cloudflare Browser Run CDP)** — zero-install demand (unlighthouse#379) but numbers are not comparable to local lab runs.
4. **Hosted/shared report server** — unlighthouse#25, lighthouse-ci#461; static report covers most of it first.
5. **Live web UI during scan via `Bun.serve` routes** — nice, but the static report is what people share.
