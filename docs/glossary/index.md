# Glossary

## Core

### Route Definition

A route definition is the mapping of a page file (such as a vue component or markdown file), and it's URL path (or paths) that it represents.

The page component has multiple representations:
1. _static route_ - name matches the path (/about.vue -> /about/),
2. _dynamic route_ - a query is used to generate a set of paths (/posts/:id.vue -> /posts/my-first-post/)
3. _catch-all route_ where any missed paths will be caught (/404.vue -> /some-missing-page)

Additional meta-data is provided to give more context of how the mapping behaves, such as which layout to use, which
asset chunk it belongs to.

Different frameworks represent routes differently, This one is based on Nuxt.js

```ts
export interface RouteDefinition {
  name: string
  path: string
  component?: string
  componentBaseName?: string
  chunkName?: string
  _name?: string
  layout?: string
}
```

### Provider

A provider is an integration of Unlighthouse to a specific context, such as a framework or an environment.

Each provider has their own unique name and defines how they will provide URLs and route definitions to Unlighthouse.

```ts
export interface Provider {
  /**
   * Used to debug.
   */
  name?: string
  /**
   * To match a URL path to a route definition we need a router. Different definitions need different routes.
   */
  mockRouter?: MockRouter | ((routeDefinitions: RouteDefinition[]) => MockRouter)
  /**
   * The collection of route definitions belonging to the provider. These can be inferred but aren't 100% correct,
   * frameworks that can provide these should do so.
   */
  routeDefinitions?: RouteDefinition[]|(() => RouteDefinition[]|Promise<RouteDefinition[]>)
}
```

### Route Report

A fairly rigid representation of the puppeteer cluster task results (`extractHtmlPayload`, `runLighthouseTask`),
combined with the normalised route.

```ts
export interface UnlighthouseRouteReport {
  /**
   * The mapping of tasks with their status.
   */
  tasks: Record<UnlighthouseTask, UnlighthouseTaskStatus>
  /**
   * Path to the HTML extracted payload.
   */
  htmlPayload: string
  /**
   * Lighthouse Result report exported to HTML.
   */
  reportHtml: string
  /**
   * Lighthouse Result report exported to JSON.
   */
  reportJson: string
  /**
   * The route (URL Path) that the report belongs to.
   */
  route: NormalisedRoute
  /**
   * A unique representation of the route, useful for the API layer.
   */
  reportId: string
  /**
   * The lighthouse result, only set once the task is completed.
   */
  report?: LighthouseReport
  /**
   * The SEO meta-data, only set once the html payload has been extracted and passed.
   */
  seo?: {
    alternativeLangDefault?: string
    title?: string
    description?: string
    internalLinks?: number
    externalLinks?: number
    favicon?: string
    og?: {
      description?: string
      title?: string
      image?: string
    }
  }
}
```

### Unlighthouse Context

The context is provided by the `createUnlighthouse()` or `useUnlighthouse()` functions. It provides the central
API to interacting with the behaviour of Unlighthouse.

```ts
export interface UnlighthouseContext {
  /**
   * The mock router being used to match paths to route definitions.
   */
  mockRouter?: MockRouter
  /**
   * Settings that are computed from runtime data.
   */
  runtimeSettings: RuntimeSettings
  /**
   * Access the hook system, either calling a hook or listening to one.
   */
  hooks: Hookable<UnlighthouseHooks>
  /**
   * User config that has been normalised.
   */
  resolvedConfig: ResolvedUserConfig
  /**
   * The collection of route definitions associated to the site.
   */
  routeDefinitions?: RouteDefinition[]
  /**
   * Discovered routes.
   */
  routes?: NormalisedRoute[]
  /**
   * A reference to the API middleware.
   */
  api: any
  /**
   * A reference to the websocket interface, used to broadcast data.
   */
  ws: WS
  /**
   * Access the worker environment, queue tasks, inspect progress, etc.
   */
  worker: UnlighthouseWorker
  /**
   * Provider details
   */
  provider: Provider

  /**
   * To use Unlighthouse with a client, it needs a server / app to register the API and client middleware.
   *
   * @param arg
   */
  setServerContext: (arg: ServerContextArg) => Promise<UnlighthouseContext>
  /**
   * Sets the site URL that will be scanned if it's not known at initialisation.
   * @param url
   */
  setSiteUrl: (url: string) => void
  /**
   * Running Unlighthouse via CI does not require a server or the client so we have a special utility for it.
   */
  setCiContext: () => Promise<UnlighthouseContext>
  /**
   * Start the client and the queue worker. A server context must be provided before this function is called.
   */
  start: () => Promise<UnlighthouseContext>
}
```

### Mock Router

Unlighthouse provides intelligent sampling which relies on knowing which URLs map to which files in your project.
To achieve this, it needs to create its own router with your files to test any URL that comes through.

Different integrations will have different requirements from the router.
For example, different frameworks will resolve files that contain substitutes 
(for example `/posts/[post].vue` may work in one framework but not another).

```ts
export interface MockRouter { match: (path: string) => RouteDefinition }
```

## Worker

### Task

The worker will queue a route to run with multiple tasks. A task is a queued job and has their own id and status.

Unlighthouse has two core tasks:
- `inspectHtmlTask` which dumps the HTML of the URL and extracts SEO data from it (title, description, image, internal links, etc)
- `runLighthouseTask` runs the actual lighthouse process on the URL

See [cluster.task(fn)](https://github.com/thomasdondorf/puppeteer-cluster) for more details.

```ts
/**
 * Tasks that Unlighthouse will run, used to track their status.
 */
export type UnlighthouseTask = 'inspectHtmlTask'|'runLighthouseTask'

/**
 * Each task ran by unlighthouse (extractHtmlPayload, runLighthouseTask) has a specific status which we can expose.
 */
export type UnlighthouseTaskStatus = 'waiting'|'in-progress'|'completed'|'failed'
```

## Client

### Columns

A column will generally be either a direct mapping to a lighthouse audit (such as console errors) or a computed mapping to
multiple lighthouse audits (such as image issues).

It can also exist as a mapping to the SEO meta-data (such as meta description).

```ts
export interface UnlighthouseColumn {
  /**
   * The column header name.
   */
  label: string
  /**
   * If the user hovers over the label they'll see a tooltip for extra context.
   */
  tooltip?: string
  /**
   * A component instance which should be used to render the column cells contents.
   */
  component?: () => Promise<unknown>
  /**
   * The key within the UnlighthouseRouteReport that maps to the column, used for automatic value inferring.
   */
  key?: string
  /**
   * Column sizing definition, needed for a responsive UI.
   */
  cols?: Partial<Record<WindiResponsiveClasses, number>>
  /**
   * Can the column can be sorted?
   *
   * @default false
   */
  sortable?: boolean
  /**
   * The key within the UnlighthouseRouteReport that is used to sort the column. This will default to the key if not provided.
   */
  sortKey?: string
  /**
   * Extra classes that should be added to the column.
   */
  classes?: string[]
}
```
