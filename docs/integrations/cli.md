# CLI

## Introduction

Using the Unlighthouse CLI is the primary way to scan entire production sites.

### Features

<ul class="list-style-none mt-3 ml-0 p-0 m-0">
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Accurate Performance Metrics</li>
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Minimal configuration</li>
</ul>

## Install

### Single run

If you prefer not to add a global dependency you can run Unlighthouse once off.

Using pnpm dlx (recommended) - requires [pnpm](https://pnpm.io/).

```bash
pnpm dlx unlighthouse --site <your-site>
```

Using npx

```bash
npx unlighthouse --site <your-site>
```

### Install Globally

```bash
npm add -G @unlighthouse/cli
# yarn global add @unlighthouse/cli
# pnpm add -G @unlighthouse/cli
```

Once installed you'll be able to use the CLI from anywhere with `unlighthouse`.

```bash
unlighthouse --site example.com
```

### With Chrome Dependency

Unlighthouse aims to keep the installation size small, for this reason it depends natively on your locally installed
chrome.

If you do not have a chrome installation, you can install it with the following command:

```bash
npm add -G @unlighthouse/cli puppeteer
# yarn global add @unlighthouse/cli puppeteer
# pnpm add -G @unlighthouse/cli puppeteer
```

## Usage

You can begin using Unlighthouse CLI as soon as it's installed.

If you want to configure Unlighthouse, you can create a `unlighthouse.config.ts` file in your project root.

```ts unlighthouse.config.ts

export default {
  site: 'example.com',
  debug: true,
  scanner: {
    device: 'desktop'
  }
}
```

See the [Configuration](#configuration) section for more details and the guides.
