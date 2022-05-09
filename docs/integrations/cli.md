# CLI

## Introduction

Using the Unlighthouse CLI is the primary way to scan entire production sites.

### Features

<ul class="list-style-none mt-3 ml-0 p-0 m-0">
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Accurate Performance Metrics</li>
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Minimal configuration</li>
</ul>

## Install

<sponsor-banner />

### Single run

If you prefer not to add a global dependency you can run Unlighthouse once off.

Using pnpm dlx (recommended) - requires [pnpm](https://pnpm.io/).

```bash
pnpm dlx unlighthouse --site <your-site>
# or if that doesn't work try:
# pnpm dlx unlighthouse-puppeteer --site example.com
```

Using npx

```bash
npx unlighthouse --site <your-site>
# or if that doesn't work try:
# npx unlighthouse-puppeteer --site example.com
```

### With Chrome Dependency

Unlighthouse aims to keep the installation size small, for this reason it depends natively on your locally installed
chrome.

If you get errors about puppeteer or chrome not being available, the easiest way to resolve it is 
with the `unlighthouse-puppeteer` binary.

```bash
unlighthouse-puppeteer --site example.com
```

You will need to use `unlighthouse-puppeteer` anywhere it says `unlighthouse`.

### Usage

Once installed globally you'll have access to Unlighthouse through the `unlighthouse` binary.

Do a the default scan.
```bash
unlighthouse --site example.com --debug
```

Run without caching, throttle the requests and do 3 samples.

```bash
unlighthouse --site example.com --debug --no-cache --throttle --samples 3
```

## Configuration

Configuring the CLI can be done either through the CLI arguments or through a config file.

See the [Configuration](#configuration) section for more details and the guides.

### CLI Options

| Options                |                                                                                                                                     |
|------------------------|-------------------------------------------------------------------------------------------------------------------------------------|
| `-v, --version`        | Display version number.                                                                                                             |
| `--site <url>`         | Host URL to scan.                                                                                                                   |
| `--root <path>`        | Define the project root.                                                                                                            |
| `--config-file <path>` | Path to config file.                                                                                                                |
| `--output-path <path>` | Path to save the contents of the client and reports to.                                                                             |
| `--cache`              | Enable the caching.                                                                                                                 |
| `--no-cache`           | Disable the caching.                                                                                                                |
| `--desktop`            | Simulate device as desktop.                                                                                                         |
| `--mobile`             | Simulate device as mobile.                                                                                                          |
| `--throttle`           | Enable the throttling.                                                                                                              |
| `--samples`            | Specify the amount of samples to run.                                                                                               |
| `--urls`               | Specify explicit relative URLs as a comma-seperated list.<br>e.g. `unlighthouse --site unlighthouse.dev --urls /guide,/api,/config` |
| `--enable-javascript`  | When inspecting the HTML wait for the javascript to execute. Useful for SPAs.                                                       |
| `--disable-javascript` | When inspecting the HTML, don't wait for the javascript to execute.                                                                 |
| `--enable-i18n-pages`  | Enable scanning pages which use x-default.                                                                                          |
| `--disable-i18n-pages` | Disable scanning pages which use x-default.                                                                                         |
| `-d, --debug`          | Debug. Enable debugging in the logger.                                                                                              |
| `-h, --help`           | Display available CLI options                                                                                                       |


### Config File

If you want to configure Unlighthouse, you can create a `unlighthouse.config.ts` file in your cwd.

```ts unlighthouse.config.ts

export default {
  site: 'example.com',
  debug: true,
  scanner: {
    device: 'desktop'
  }
}
```
