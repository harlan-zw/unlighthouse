---
title: "Lighthouse Configuration"
description: "Customize Google Lighthouse audit settings, categories, and performance thresholds within Unlighthouse scans."
keywords:
  - lighthouse options
  - lighthouse configuration
  - lighthouse categories
  - customize lighthouse
  - lighthouse audit settings
navigation:
  title: "Lighthouse Config"
relatedPages:
  - path: /guide/guides/device
    title: Device Configuration
  - path: /api-doc/config
    title: Config Reference
  - path: /glossary
    title: Core Web Vitals Glossary
---

# Lighthouse Configuration

Customize audit categories, performance thresholds, and behavior through the `lighthouseOptions` configuration key. Unlighthouse passes these options directly to Google Lighthouse.

Unlighthouse v1 runs **Lighthouse 13**. See the [Lighthouse 13 release notes](https://github.com/GoogleChrome/lighthouse/releases) for the full changelog; the additions that affect Unlighthouse are the new `agentic-browsing` category and the expanded insight audits, both covered below.

```ts
import { defineUnlighthouseConfig } from 'unlighthouse/config'

export default defineUnlighthouseConfig({
  lighthouseOptions: {
    throttlingMethod: 'devtools',
  },
})
```

For complete options, see the [Lighthouse Configuration docs](https://github.com/GoogleChrome/lighthouse/blob/master/docs/configuration.md).

## Aliases

Unlighthouse aims to minimise and simplify configuration, where possible.

For this reason, a number of configurations aliases are provided for your convenience.

- [Switching device: mobile and desktop](/guide/guides/device)
- [Toggle Throttling](/guide/guides/device#network-throttling)

You can always configure lighthouse directly if you are comfortable with the configuration.

## Selecting Categories

By default, Unlighthouse will scan the categories: `'performance', 'accessibility', 'best-practices', 'seo', 'agentic-browsing'`.

The performance category measures [Core Web Vitals](/glossary) including [LCP](/glossary/lcp), [CLS](/glossary/cls), and [INP](/glossary/inp). The `agentic-browsing` category is new in Lighthouse 13 (see below).

It can be useful to remove certain categories from being scanned to improve scan times. The Unlighthouse UI will adapt
to any categories you select.

**Only Performance**

```ts
export default defineUnlighthouseConfig({
  lighthouseOptions: {
    onlyCategories: ['performance'],
  },
})
```

## Agentic Browsing (Lighthouse 13)

Lighthouse 13 adds the `agentic-browsing` category, which measures how well a page can be driven by AI agents. Unlighthouse scans it by default and surfaces it as a fifth score alongside performance, accessibility, best-practices, and SEO.

Chrome's [agentic browsing scoring docs](https://developer.chrome.com/docs/lighthouse/agentic-browsing/scoring) mark this category as experimental. Current Chrome guidance requires Chrome 150 or later for the category, and WebMCP-specific audits require the WebMCP origin trial. Unlighthouse enables the DevTools WebMCP feature flag for local Lighthouse launches, but the final result still depends on the Chrome binary and remote browser service you run against.

Unlike the traditional categories, agentic browsing is displayed as a fraction rather than a 0-100 gauge. Unlighthouse preserves that display mode in the UI, API, and JSON reports.

The category rolls up these audits:

- `agent-accessibility-tree` — is the page's accessibility tree usable by an agent?
- `webmcp-registered-tools` — does the page register [WebMCP](https://github.com/webmachinelearning/webmcp) tools?
- `webmcp-form-coverage` — how many forms are exposed as agent-callable tools?
- `webmcp-schema-validity` — are the registered tool schemas valid?
- `cumulative-layout-shift` — is the page stable enough for an agent to interact with it?
- `llms-txt` — does an optional `llms.txt` file follow Lighthouse's recommendations?

The built-in [`agentic-browsing` pack](/api-doc) reconciles these across every route into a single readiness report (WebMCP coverage, `llms.txt` presence, agent-accessibility pass rate). Drop the category to skip the work:

```ts
export default defineUnlighthouseConfig({
  lighthouseOptions: {
    onlyCategories: ['performance', 'accessibility', 'best-practices', 'seo'],
  },
})
```

### Adapter support

| Auditor adapter | Agentic browsing support | Notes |
| --- | --- | --- |
| Local Lighthouse | Yes, with compatible Chrome | Unlighthouse launches Chrome with `DevToolsWebMCPSupport` enabled unless you explicitly disable that Chrome feature. Use Chrome 150+ for full category support. |
| Cloudflare Lighthouse Container | Depends on Browser Run Chrome | The Worker passes Lighthouse flags and device through to the Container; the Container runs Lighthouse over CDP. WebMCP coverage depends on the remote Browser Run CDP surface. |
| Remote Lighthouse | Configurable | The default Browserless-compatible transport still sends `{ url, config }`. Use a custom transport when your remote service accepts Lighthouse flags, and narrow `capabilities.categories` if the vendor is not on Lighthouse 13 or does not expose WebMCP. |
| PageSpeed Insights | No | PSI does not support `agentic-browsing`; Unlighthouse rejects that category before calling the API. |
| Cloudflare Browser Rendering direct adapter | No | The Worker binding does not expose Chrome feature flags, so it should not be used for WebMCP-dependent agentic audits. |

## Insight Audits

Lighthouse's newer *insight* audits (ids ending in `-insight`, e.g. `render-blocking-insight`, `lcp-discovery-insight`) carry per-metric savings estimates in milliseconds (LCP, FCP, INP, TBT) or as a dimensionless delta (CLS). Unlighthouse projects those savings at ingest, and the built-in `insights` pack ranks them site-wide: which insight, how many routes it affects, the total and worst-single-route savings, and a priority order. This is how a scan turns a flat audit dump into "fix these three things first."
