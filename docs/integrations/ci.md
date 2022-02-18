# Continuous Integration

## Introduction

Using the Unlighthouse CI helps you to avoid regressions on your entire sites Google Lighthouse issues.

### Features

<ul class="list-style-none mt-3 pl-0 m-0">
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Perform an assertion on a specific score budget</li>
<li class="flex items-center pb-2 "><i-carbon-checkmark-outline class="text-green-500 mr-2" /> Generate a static build of the report</li>
</ul>

## Install

Unlighthouse aims to keep the installation size small, for this reason it depends natively on your locally installed chrome.

To use Unlighthouse in a CI context, you'll need to install puppeteer alongside the cli.

```bash
npm add @unlighthouse/cli puppeteer
# yarn add @unlighthouse/cli puppeteer
# pnpm add @unlighthouse/cli puppeteer
```

## Usage

### Budget assertions

Unlighthouse simplifies budget assertions. You can provide a single budget number which will be used
to validate all pages and on all selected categories.

```bash
# Run the CI with a budget, will fail if any pages report any category less than 50
unlighthouse-ci --site <your-site> --budget 50
```

Alternatively, you can provide a configuration file with a list of budgets for each category.

```ts unlighthouse.config.ts
export default {
  site: 'https://example.com',
  ci: {
    budget: {
      performance: 50,
      accessibility: 100,
      'best-practices': 90,
      seo: 90,
    }
  }
}
```

```bash
# Run in the directory the unlighthouse.config.ts is in
unlighthouse-ci
```

### Build static report

**Examples**

- https://vue-demo.unlighthouse.dev/
- https://inspect.unlighthouse.dev/

Pass the `--build-static` flag to the binary to generate the static files needed to host the report.

```bash
# NPM
unlighthouse-ci --site harlanzw.com --debug --build-static
```

This will generate files in your `outputPath` (`.lighthouse` by default).

You can upload the directory `client` to a static host from there.


## Example

This example is for Github Actions and deploys a static client build to Netlify.

```yml unlighthouse.yml
name: Assertions and static report

on:
  workflow_dispatch:

jobs:
  demo:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
        with:
          fetch-depth: 0

      - name: Install Dependencies
        run: npm add @unlighthouse/cli puppeteer

      - name: Unlighthouse assertions and client
        run: unlighthouse-ci --site <your-site> --budget 75 --build-static

      - name: Deploy report to Netlify
        uses: nwtgck/actions-netlify@v1.2
        with:
          publish-dir: './.lighthouse/client'
          production-branch: main
          production-deploy: true
          github-token: ${{ secrets.GITHUB_TOKEN }}
          deploy-message: "New Release Deploy from GitHub Actions"
          enable-pull-request-comment: false
          enable-commit-comment: true
          overwrites-pull-request-comment: true
        env:
          NETLIFY_AUTH_TOKEN: ${{ secrets.NETLIFY_AUTH_TOKEN }}
          NETLIFY_SITE_ID: ${{ secrets.NETLIFY_DEMO_SITE_ID }}
        timeout-minutes: 1
```
