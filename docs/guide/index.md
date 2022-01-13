# Introduction

<sponsor-banner />

Unlighthouse is an entire site audit tool with a modern UI for scanning live and development sites using Google Lighthouse

To use Unlighthouse you'll need to decide which environment and provider makes sense for you.

## Production Scanning

Running Unlighthouse on production sites is the easiest to get familiar with it and recommended for new users.

### Features
<ul class="list-style-none mt-3 m-0">
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Accurate Performance Metrics</li>
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> No setup required in most cases</li>
</ul>

### Trade-offs
<ul class="list-style-none mt-3 m-0">
<li class="flex items-center pb-2 "><i-carbon-warning-alt class="text-yellow-600 mr-2" /> Less stable for edge-case sites</li>
<li class="flex items-center"><i-carbon-warning-alt class="text-yellow-600 mr-2" /> No feedback when fixing bugs</li>
</ul>

### Providers

| Provider                 | Use Case                                                                                                                                                                                                                                            |
|--------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| [CLI](/integrations/cli) | Scan a production site such as [unlighthouse.dev](https://unlighthouse.dev).<br><br> You can manually provide a project mapping for [intelligent sampling](/guide/sampling).                                                                        |
| [CI](/integrations/ci)   | Run scans on sites based on automation events, i.e releasing and make [assertions on scores](/integrations/ci#assertions).<br><br> Can also be used to generate report sites such as [inspect.unlighthouse.dev](https://inspect.unlighthouse.dev/). |


## Development Scanning

### Features
<ul class="list-style-none mt-3 m-0">
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Get immediate feedback on your fixes with changed pages being re-audited automatically</li>
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Get direct links to files for routes</li>
<li class="flex items-center"><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Less configuration to manage</li>
</ul>

### Trade-offs
<ul class="list-style-none mt-3 m-0">
<li class="flex items-center pb-2 "><i-carbon-warning-alt class="text-yellow-600 mr-2" /> Throttling is redundent</li>
<li class="flex items-center"><i-carbon-warning-alt class="text-yellow-600 mr-2" /> Performance metrics may be off</li>
</ul>

### Providers

| Provider                         | Features                                                                                      | Status     |
|----------------------------------|-----------------------------------------------------------------------------------------------|------------|
| [Nuxt.js](/integrations/nuxt)    | <ul class="p-0 m-0"><li>Single Server</li><li>HMR</li><li>Automatic Route Discovery</li></ul> | Functional |
| [Vite](/integrations/vite)       | <ul class="p-0 m-0"><li>HMR</li><li>Automatic Route Discovery</li></ul>                       | WIP        |
| [webpack](/integrations/webpack) | <ul class="p-0 m-0"><li>HMR</li></ul>                                                         | WIP        |
| [rollup](/integrations/rollup)  | <ul class="p-0 m-0"><li>TBA</li></ul>                                                         | WIP        |

## Community

If you have questions or need help, reach out to the community at [GitHub Discussions](https://github.com/harlan-zw/unlighthouse/discussions).
