# User flows

A page audit measures a cold load. A user flow measures a journey: open the home page, type a search, submit it, add to cart. Unlighthouse runs flows with Lighthouse's user-flow API (`startFlow`), so each journey produces a series of Lighthouse steps:

| Step | Started with | Measures |
|---|---|---|
| navigation | `flow.navigate(url)` or `flow.startNavigation()` … `flow.endNavigation()` | A page load: category scores, FCP, LCP, TBT, CLS, Speed Index, TTFB |
| timespan | `flow.startTimespan()` … `flow.endTimespan()` | Whatever happens in between: **INP**, TBT and CLS from real interactions. The closest a lab gets to interaction data. |
| snapshot | `flow.snapshot()` | The page as it is now: accessibility, best practices, SEO of a state reached by interaction (an open menu, a filled form) |

For timespan and snapshot steps a category score is the share of passed audits, the same fraction Lighthouse's flow report shows; it is not a weighted Lighthouse score. A category a mode does not support (SEO in a timespan) is `null`.

## Writing a flow

A flow is a module whose default export receives `{ flow, page, url, device }`:

- `flow`: Lighthouse's `UserFlow`. Unlighthouse limits each step to the categories the step's mode supports; pass `onlyCategories` in a step's flags to override.
- `page`: the Puppeteer page, already carrying the scan's auth (headers, cookies, storage, captured login).
- `url`: the start URL (the flow's `url`, resolved against `site`, or `site`).
- `device`: `mobile` or `desktop`; Lighthouse emulates it.

```ts
import type { FlowContext } from '../../src/audit/flow.ts'

export default async function search({ flow, page, url }: FlowContext): Promise<void> {
  await flow.navigate(url, { name: 'Open the home page' })

  await flow.startTimespan({ name: 'Type a search' })
  await page.type('input[name=q]', 'running shoes', { delay: 50 })
  await flow.endTimespan()

  await flow.startNavigation({ name: 'Submit the search' })
  await page.keyboard.press('Enter')
  await flow.endNavigation()

  await flow.snapshot({ name: 'Results' })
}
```

This is [`examples/flows/search.ts`](../examples/flows/search.ts). Name every step; the names are how budgets, the CLI and `flows.get` refer to them. A flow must run at least one step. If the module throws, the run is recorded as failed with the error message.

## Running flows with a scan

Flows live in the config file:

```ts
import { defineConfig } from './src/config.ts'

export default defineConfig({
  site: 'https://shop.example',
  devices: ['mobile', 'desktop'],
  flows: [
    { name: 'search', module: './flows/search.ts' },
    { name: 'checkout', module: './flows/checkout.ts', url: '/cart', devices: ['mobile'], timeoutMs: 180_000 },
  ],
  budgets: {
    flows: {
      search: { steps: { metrics: { inp: 200, cls: 0.1 }, scores: { performance: 0.8 } } },
    },
  },
})
```

| Key | Default | Meaning |
|---|---|---|
| `name` | required | Unique; no slashes |
| `module` | required | Path, relative to the directory Unlighthouse runs in |
| `url` | `site` | Start URL or path |
| `devices` | `devices` | Devices to run the flow on |
| `timeoutMs` | `timeoutMs` | Hard limit for the whole flow, not per step |

After the page audits, Unlighthouse runs each flow once per device, one at a time. Each run gets its own worker process and its own Chrome, the same auth injection as page audits, and a hard timeout after which the worker and its Chrome are killed as a process group. Cancelling the scan kills a running flow the same way. Flows are not retried: a journey that adds to a cart or submits a form should not run twice by accident. A failed flow does not fail the scan; it is stored with its error and fails any budget set for it.

Flows run code, so they come from the config file only. `scans.start` over the HTTP API or MCP does not accept them; a scan started there still runs the flows of the config file the server was started with.

## Results

- `flows.list { scanId }`: every run with its steps, scores, metrics and finding counts.
- `flows.get { scanId, name, device }`: one run with the findings of every step (failing audits narrowed to the item they name, as for pages). Flow findings are kept apart from page findings, so they do not change the site-wide issue ranking.
- `scans.summary` has a compact `flows` entry: per run, its status and per step the mode, performance score, INP, TBT, CLS, LCP and finding count.
- `/flow-report/<scanId>/<flow>/<device>` serves Lighthouse's own flow report (token required, like `/report`).
- `unlighthouse export` writes `flows.json` (runs, steps, findings) and `flow-reports/*.html` next to the dashboard.

## Budgets

`budgets.flows.<name>.steps.scores` sets a minimum per category and `budgets.flows.<name>.steps.metrics` a maximum per metric (`fcp`, `lcp`, `tbt`, `cls`, `si`, `ttfb`, `inp`). Each limit is checked on every step of that flow that measures it, so `inp: 200` applies to every timespan step. Results appear in `budgets.check` and `unlighthouse ci` as `flow:score:<category>` and `flow:metric:<metric>` with the scope `<flow> · <device> · <step>`; a failed run is `flow:run`.

## Ad hoc runs

```sh
unlighthouse flow ./flows/search.ts --url https://shop.example --device mobile --report flow.html
```

Runs one flow without a scan and prints its steps; nothing is stored. It uses the config file's auth (including `auth.login`), categories, throttling and Chrome settings. `--report` writes Lighthouse's flow HTML report (with several devices, one file per device), `--json` prints the steps with their findings, `--timeout <ms>` overrides the limit. Exit code 0 when every run finished, 2 otherwise.
