# Introduction

Unlighthouse is an entire site audit tool, built with a modern UI for scanning live and development sites using Google
Lighthouse.

## Getting Started with the CLI

To start using Unlighthouse with production sites, you'll be using the CLI.

Using the CLI is the quickest way to get familiar with Unlighthouse and is recommended for new users.

Using pnpm dlx (recommended) - requires [pnpm](https://pnpm.io/).

```bash
pnpm dlx unlighthouse --site <your-site>
```

Using npx

```bash
npx unlighthouse --site <your-site>
```

To see all available options, visit the [CLI integration](/integrations/cli).

### Features

<ul class="list-style-none mt-3 m-0">
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Accurate Performance Metrics</li>
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Minimal configuration</li>
</ul>

### Trade-offs

<ul class="list-style-none mt-3 m-0">
<li class="flex items-center pb-2 "><i-carbon-warning-alt class="text-yellow-600 mr-2" /> Less stable for edge-case sites</li>
<li class="flex items-center"><i-carbon-warning-alt class="text-yellow-600 mr-2" /> No feedback when fixing bugs</li>
</ul>

### Providers

| Provider                 | Use Case                                                                                                                                                                                                                                            |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [CLI](/integrations/cli) | Scan a production site such as [unlighthouse.dev](https://unlighthouse.dev).<br><br> You can manually provide a project mapping for [routes definitions](/guide/route-definitions).                                                                 |
| [CI](/integrations/ci)   | Run scans on sites based on automation events, i.e releasing and make [assertions on scores](/integrations/ci#assertions).<br><br> Can also be used to generate report sites such as [inspect.unlighthouse.dev](https://inspect.unlighthouse.dev/). |

## Getting Started – Integrations

Scan your development sites, unlock extra features and less configuration with the provided integrations.

### Features

<ul class="list-style-none mt-3 m-0">
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Close the feedback loop with changed pages being re-audited automatically</li>
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Get direct links to files for routes</li>
<li class="flex items-center"><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Less configuration to manage</li>
</ul>

### Trade-offs

<ul class="list-style-none mt-3 m-0">
<li class="flex items-center pb-2 "><i-carbon-warning-alt class="text-yellow-600 mr-2" /> Throttling is redundant</li>
<li class="flex items-center"><i-carbon-warning-alt class="text-yellow-600 mr-2" /> Performance metrics won't be accurate</li>
</ul>

### Providers

| Provider                                                                                                        | Features                                                                                      |
|-----------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------------------------------------|
| <a href="/integrations/nuxt" class="flex items-center"><i-logos-nuxt-icon class="mr-2 text-xl" /> Nuxt.js</a>   | <ul class="pl-3 p-0 m-0"><li>Hot Module Reloading</li><li>Automatic Route Discovery</li></ul> |
| <a href="/integrations/vite" class="flex items-center"><i-logos-vitejs class="mr-2 text-xl" /> Vite</a>         | <ul class="pl-3 p-0 m-0"><li>Hot Module Reloading</li><li>Automatic Route Discovery</li></ul> |
| <a href="/integrations/webpack" class="flex items-center"><i-logos-webpack class="mr-2 text-xl" /> webpack</a>  | <ul class="pl-3 p-0 m-0"><li>Hot Module Reloading</li></ul>                                   |

## Getting Help

If you have questions or need help, reach out to the community on the [Discord](https://unlighthouse.dev/chat).
