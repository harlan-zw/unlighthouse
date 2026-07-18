# Context — Ubiquitous Language

The canonical vocabulary for Unlighthouse v1. When a term here is used loosely in conversation, code, or docs, we mean *this* definition. This file is a glossary and nothing else: no implementation details, no file paths, no code. Keep it current — when a term's meaning shifts, fix it here in the same change.

Many entries carry a **Not:** line. That is the disambiguation — the neighbouring concept this term is most often confused with. Getting those boundaries right is the point of this document.

Where the code lives is [`ARCHITECTURE.md`](ARCHITECTURE.md). Why we build it is [`VISION.md`](VISION.md). Per-metric definitions (LCP, CLS, INP, TBT, …) are in [`docs/glossary/`](docs/glossary/).

## Product & stance

**Unlighthouse** — a site-wide Lighthouse scanner. It crawls a whole site, runs Lighthouse against every route, groups the results, and tracks them from one scan to the next.

**v1** — the current generation, where the scan **engine is a primitive** and everything else (CLI, agent tooling, dashboard, serverless) consumes it. A clean break from v0; not backwards compatible.

**v0** — the original generation: a CLI that wrapped Lighthouse in a single Node-only pipeline. Referenced only to contrast with v1.

**Host** — anything that drives the engine: the CLI, the agent (MCP) server, the serverless preset, the dashboard, or a user's own code. Every host speaks the same commands.

**Command** — a transport-agnostic typed operation spoken by every Host, identified by name and carrying input and output contracts plus optional streaming semantics.
**Not:** an HTTP route, MCP tool, or CLI subcommand — those are transport projections of a Command.

**Primitive** — our framing of the engine as something to *compose*, not merely *consume*. The user supplies a few pieces; the rest is theirs.

**BYO (bring your own)** — the stance that the browser and storage backend are the user's choice, not something we bundle. We ship adapters for common choices and document the seam.

**Static report** / **snapshot** — a self-contained, offline copy of a scan's data baked into the dashboard so it can be shared or hosted with no running backend. The dashboard reads the snapshot instead of a live host, but sees the same shape.
**Not:** a live scan — a snapshot is frozen; nothing can be started, cancelled, or rescanned from it.

## Core entities

The spine of the model is a three-level hierarchy: a **Site** has many **Scans**; a **Scan** has many **Routes**.

**Site** — a website Unlighthouse tracks over time, held in a persistent registry with an id, a name, and a URL. Scans of the same site link back to it, which is what makes cross-scan history and comparison meaningful.
**Not:** a single scan of that site, and not merely the URL string a one-off scan happens to target — a Site is the durable registry entry that outlives any individual run.

**Scan** — one complete run over a site (or a single page). The unit of history. Everything a run produces is attributed to its scan id, and a scan carries the context it ran under: which device(s), which mode, and the CI metadata (branch, commit, message) if any.
**Not:** a Site (a Scan is one point in a Site's history), and not a single Route's result.

**Scan id** — the opaque identifier the engine mints for a scan and threads through every event, record, and artifact. Callers treat it as a token, never parse it.

**Route** — one audited URL within a scan, together with its scores and metrics. A route is identified by the combination of **scan + URL + device** — so the same URL audited on mobile and desktop is two routes, not one, and their results never collapse together.
**Not:** a bare URL (device is part of a route's identity), and not a Seed (a Seed is an *input* URL; a Route is an *audited* result).

**Route name** — an optional label grouping URLs that share a template or definition (e.g. a blog-post route matching many posts). A hint carried from discovery, not a required field.

**Template group** — routes bucketed by their shared template (via route name), so a summary can say "the blog-post template regressed" instead of listing 400 URLs. The unit of the layered overview, not a stored entity.
**Not:** a category — a template group buckets *routes*; a category buckets *audits*.

## Devices & modes

**Device** — the form factor a URL is audited under: `mobile` or `desktop`. Mobile is the default. Each device implies its own emulation profile (screen, throttling), so scores are only comparable within the same device.
**Not:** a real physical device or a browser — it is a Lighthouse emulation profile.

**Device matrix** — the set of devices a single scan covers. A matrix scan audits every URL once per device, all under one scan id, so "mobile + desktop" is one run, not two.

**Scan mode** — `site` crawls the whole site by following discovered links; `page` audits only the seeded URL(s) and follows nothing.
**Not:** the auditor choice — mode is about *how much* gets scanned, not *how* a URL is measured.

**Sample** — a repeated audit of the same URL to smooth run-to-run variance. The sample count is how many times each URL is measured.

## Scores, categories & metrics

These three are routinely conflated. They are distinct.

**Category** — a Lighthouse audit grouping that carries a headline score: performance, accessibility, SEO, best-practices, and agentic-browsing. There is a fixed, small set of them; all five are scanned by default.
**Not:** a metric, and not an audit — a category is an *aggregate* over many audits.

**Agentic browsing** — the category new in Lighthouse 13 that scores how well a page can be driven by an AI agent: WebMCP tool/form/schema coverage, `llms.txt` presence, and agent-accessibility. Our long-standing "GEO / AI-readability" ambition, now a native Lighthouse category rather than a bespoke pack.
**Not:** the agentic (MCP) *host* that drives the engine — that is a consumer of Unlighthouse; agentic browsing is a *property of the audited page*.

**Score** — a 0-to-1 number (higher is better). Every category has one; a scan's aggregate score averages them. A score of `null` means "not measured," which is never the same as a score of zero.
**Not:** a metric value — a score is normalized and unitless; a metric is a raw measurement.

**Metric** — a raw performance measurement: LCP, CLS, INP, FCP, TTFB, TBT, Speed Index. Most are milliseconds; CLS is a dimensionless number. Lower is better. Per-metric meanings live in [`docs/glossary/`](docs/glossary/).
**Not:** a score (metrics feed scores but are reported in their own units), and not a category.

**Lab data** — metrics measured in a controlled, emulated environment during the scan. The default.
**Field data** — metrics from real users in the wild (via CrUX). An optional signal, surfaced alongside lab data, never a substitute for it.
**Not:** interchangeable — an auditor advertises whether it produces reliable lab scores and/or reliable field data, and we never silently mix the two.

## Reports & findings

A single URL's audit exists in three representations, from richest to leanest. Know which one a consumer needs.

**Report** (raw **LHR**) — the complete, verbatim Lighthouse result for one URL. The source of truth, kept as an opaque artifact. Large.
**Reconciled report** — the normalized, stable-shaped projection we derive from a raw report at ingest time. It keeps only the fields consumers actually need, so it survives Lighthouse version drift and stays small. This is what packs read.
**Extracted metrics** — the flat, queryable row of a route's scores and metric values. The hot path for listing, sorting, and filtering routes.
**Not:** three copies of the same thing to keep in sync casually — they are deliberate tiers (verbatim / stable projection / queryable summary), and a consumer picks the leanest tier that answers its question.

**Audit finding** — one Lighthouse audit's result within a reconciled report: its id, score, human-facing title and description, any savings estimate, and a pre-bucketed severity.
**Not:** a category (a finding is a single audit; a category aggregates many), and not a Pack.

**Insight audit** — a newer class of Lighthouse audit (its id ends in `-insight`) that quantifies a specific fix as an estimated metric saving (milliseconds off LCP/FCP/INP/TBT, or a CLS delta). The substrate for prioritisation: "fix these three things first, in this order."
**Not:** a metric (an insight estimates *how much a fix would move* a metric; the metric is the measurement itself), and not a category.

**Severity** — a finding's bucket derived from its score: `pass`, `warn`, or `fail`. Informational and not-applicable audits are always `pass`. Computed once at ingest so consumers never re-derive the rule.
**Not:** the comparison sense of the word (see *change status* below) — this severity describes one audit's health, not a scan-over-scan movement.

**Provenance** — the recorded circumstances of a report: Lighthouse version, machine benchmark, warnings, runtime error. What lets us trust or discount a result.

**Stack pack** — Lighthouse's own framework-specific advice bundled inside a report (e.g. WordPress tips).
**Not:** an Unlighthouse **Pack** (below). Same word "pack," entirely different concept — a stack pack is upstream Lighthouse content we pass through; a Pack is our curated output unit.

## Engine & ports

**Engine** / **Core** — the runtime-agnostic scanner. It knows how to turn URLs into audited results; it knows nothing about *where* it runs.

**Local runtime** — the Node-host composition that wires the engine to filesystem-backed storage, a crawler, an auditor, seed sources, and the command handler context used by the default host, CLI, and MCP entrypoints.
**Not:** the Engine/Core itself — the engine is runtime-agnostic, while the local runtime is one host composition.

**Scan directory** — the filesystem-backed history selected for a local runtime, scoped to one site and configuration when that identity is known.
**Not:** the output root — the root may contain scan directories for many sites and configurations.

**Port** — a capability the engine depends on but does not implement, supplied by the host. The four ports: **Seed source**, **Crawler**, **Auditor**, **Storage**.

**Adapter** — a concrete implementation of a port. Guiding rule: one adapter is a *hypothetical* seam; a second real adapter is what makes it a true port.

**Deferred seam** — a capability that would be a port but has only one adapter today, so it stays an inline shape until a second adapter earns the promotion.

**Seed source** — produces the set of URLs a scan should cover. A **Seed** is an input URL tagged with where it came from (sitemap, manual, and so on).
**Not:** a Route — a Seed is an *input* to the scan; a Route is an audited *result*.

**Crawler** — drives the loop that pulls seeds, hands each URL to the auditor, and discovers further links as it goes.

**Auditor** — produces a report for one URL. An auditor advertises its **capabilities**: whether its performance scores are reliable, whether it provides real field data, and which categories it can cover.
**Auditor router** — an auditor that dispatches each URL to a different underlying auditor by rule (e.g. one source for lab data, another for field data). To the engine it is just an auditor.

**Storage** — where a scan's data lives, split into two kinds we never conflate: **rows** (structured, queryable records like scans and routes) and **blobs** (large opaque artifacts like raw reports).

## Scanning lifecycle & events

Two state machines exist at different altitudes; do not confuse them.

**Scan status** — the lifecycle of a scan as a whole, surfaced to observers: starting, discovering, scanning, paused, complete, cancelled, error.
**Crawler state** — the low-level state of the crawler adapter itself: idle, running, paused.
**Not:** the same machine — scan status is the session-level story an observer sees; crawler state is one adapter's internal condition.

**Crawl session** — a scan in progress: the live handle you observe, pause, resume, or cancel. **Single-session**: a given engine runs one scan at a time; asking it to start a second while one is active is a conflict. Pause/resume is a *capability*, not a guarantee — some crawlers genuinely cannot pause, and the session says so.

**Rescan** — re-running audits for something already scanned (a route, a whole scan, or a history entry) to refresh its results.

**Import** — ingesting an externally-produced scan (e.g. one a CI job ran elsewhere) into a host's storage as-is, without re-running any audits. No-overwrite by design: importing a scan id that already exists is a conflict.
**Not:** a scan or a rescan — an import performs no auditing; it only persists results produced elsewhere.

**Hookable bus** / **hooks** — the shared, stable, public event stream an observer subscribes to: scan lifecycle, per-route completion, assertions, comparisons, quota, and logging. Schema-versioned; safe to depend on.
**Crawl event** — a low-level, ephemeral signal from inside a crawler adapter (a URL was discovered, started, completed, failed). An implementation detail the engine translates into stable hook events.
**Not:** the same tier — depend on hook events; never on raw crawl events.

## Packs

**Pack** — a curated recipe of related audits aimed at one outcome (Core Web Vitals, images, JS bundle, accessibility, SEO, and so on). The v1 unit of curated, actionable output. A pack declares which auditors it needs, reads a scan's reconciled reports, and returns a typed report of its own. Packs are composable and can be built-in or community-authored. A pack's output for a given scan is computed once and reused.
**Not:** a port (a pack is composition *on top of* auditor and storage), an auditor (a pack consumes auditor output, it doesn't produce reports for URLs), or a Lighthouse *stack pack*.

## Comparison, assertions & budgets

**Comparison** — measuring what changed between two scans. Matching is per **route** (URL + device), so a mobile change and a desktop change to the same URL never merge.

**Baseline** — the earlier scan in a comparison (the "base"), against which the current scan is measured. When no prior scan exists to compare against, the baseline is *missing* — a named, expected condition, not a crash.

**Delta** — the signed difference in a score or metric between baseline and current.

**Change status** — how a route moved between two scans: unchanged, regressed, improved, added, or removed. At the metric level the parallel notion is regression / improvement / neutral.
**Not:** finding *severity* (pass/warn/fail) — that describes a single audit's health in one scan; change status describes movement *between* scans.

**Assertion** — a rule checked against a scan: a minimum category score, a maximum metric value, or a maximum allowed regression.
**Budget** — the threshold an assertion enforces. Failing a budget is how a scan gates a CI build.
**Not:** a comparison — an assertion is a pass/fail *rule*; a comparison is the descriptive *diff*. Assertions often read comparison output, but they are the judgment, not the data.

## Quotas & errors

**Quota** — a usage limit a host enforces on scanning work (for rate-limited or metered auditors). Observers hear when a quota is exceeded or depleted.

**Domain failure** — an expected, meaningful outcome (a scan conflict, an unsupported operation, a missing baseline, invalid config, a route that failed to audit). Represented as a value with a discriminating code and a failure category (fatal, route-failed, retryable, validation), not thrown as a surprise.
**Not:** an infrastructure error — those are unexpected and propagate. A domain failure is part of the contract; an infra error is a bug or an outage.

## Non-goals

Terms we explicitly reject, so scope stays sharp: Unlighthouse is **not** a Lighthouse fork, **not** a hosted SaaS we operate, **not** Screaming Frog, **not** a generic web crawler, **not** a real-user-monitoring tool, **not** v0-compatible, and **not** opinionated about your runtime. Full statements in [`VISION.md`](VISION.md#what-unlighthouse-is-not).
