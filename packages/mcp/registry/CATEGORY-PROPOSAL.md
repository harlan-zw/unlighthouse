# Proposed MCP category: "Site Performance"

## TL;DR

Add a top-level **Site Performance** category to the public MCP catalogs
(Smithery, MCPMarket, and any other downstream aggregator). It groups MCP
servers whose job is to *measure* a live website — Core Web Vitals,
accessibility, SEO hygiene, render-blocking resources — rather than to drive
a browser or fetch a single page.

## Why not an existing category

| Existing category    | Why it doesn't fit                                            |
|----------------------|---------------------------------------------------------------|
| Web Search           | Search returns *information about the web*. Site Performance returns *measurements of one specific site the user owns*. |
| Browser Automation   | Automation drives a browser to complete a task (login, click, scrape). Site Performance audits passively and reports scores. |
| DevTools             | Too broad. DevTools covers logs, network, debugging — anything Chrome DevTools exposes. Site Performance is about whole-site lighthouse-style scans. |
| Analytics            | Analytics tools answer "how many users did X". Site Performance answers "how fast / accessible / SEO-healthy is this URL." |
| SEO                  | Closest, but too narrow. Core Web Vitals, a11y audits, and JS-bundle analysis are not SEO; they're co-measured by the same tools. |

## Audience

- Frontend / full-stack engineers shipping production sites who want their
  agent to triage perf regressions.
- SEO consultants running audits before a client handoff.
- DevOps / SRE folks running scheduled budget checks in CI.
- Marketing / Web Vitals engineers who own LCP/CLS/INP targets.

## What belongs in this category

- Unlighthouse (whole-site Lighthouse scans + history + diffs).
- Standalone Lighthouse MCP wrappers (single-page audits).
- PageSpeed Insights / CrUX MCP wrappers.
- Axe / Pa11y accessibility scanners.
- SEO crawlers (Screaming Frog-style) once they ship an MCP.
- Bundle-analyser tools (source-map-explorer, webpack-bundle-analyzer).

## What does NOT belong

- Headless-browser drivers (Puppeteer / Playwright MCPs) — that's Browser
  Automation.
- Generic crawlers that scrape content — that's Data Extraction / Web Search.
- API testing tools — that's API Testing / DevTools.

## How to submit the category proposal

### Smithery

1. Open <https://github.com/smithery-ai/registry/issues/new> with title
   `Proposal: "Site Performance" category`.
2. Paste this file verbatim into the issue body.
3. CC the Smithery team in the body (`@smithery-ai`).
4. Reference the Unlighthouse listing as the first inhabitant.

### MCPMarket

Email or DM the team via whatever contact link appears on
<https://mcpmarket.com> (footer). If they accept GitHub PRs to a public
category file, link this document there instead.

### Official MCP registry

The official registry is **deliberately unopinionated** about categories
(see <https://modelcontextprotocol.io/registry>): "Downstream aggregators can
provide curation or additional metadata such as community ratings." So
categorisation belongs to the downstream marketplaces, not the metaregistry.
Skip this for the upstream submission.
