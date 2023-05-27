# Generating Static Reports

## Introduction

When you run Unlighthouse using `npx unlighthouse`, you're using the CLI mode. This mode generates and runs the interactive client.

This is useful for quickly scanning your site and finding issues. 

However, you want to set up some automation around these reports. Creating reports that can be accessed through a static host.

Unlighthouse ships with a [CI](/integrations/ci) mode which provides additional non-interactive features, one of them is generating static reports. Rescan routes wont work on static reports, use  `npx unlighthouse`  for it.

### Using the CI mode

You'll need to manually install the CLI as a dependency to use `unlighthouse-ci` from the command line.

```bash
npm install -g @unlighthouse/cli puppeteer
# yarn global add @unlighthouse/cli puppeteer
# pnpm install -g @unlighthouse/cli puppeteer
```

Please refer to the [CI](/integrations/ci) documentation for all features.

### Static Reports

You can create static, self-hosted reports for your sites using the CI. This allows you to generate an always up-to-date version
of how your site is performing overall.

You can see an example of this here: https://inspect.unlighthouse.dev/.

You can generate a report like this by providing the `--build-static` flag.

```bash
unlighthouse-ci --site <your-site> --build-static
```

This will generate files in your `outputPath` (`.unlighthouse` by default). You can upload the `client` directory to a static host from there.

If you want to preview the static report you can run `npx sirv-cli .unlighthouse/client`

Note: You will need to host your site using a web server.

## CloudFlare Pages Example

You should create a CloudFlare Pages site using [Direct Upload](https://developers.cloudflare.com/pages/platform/direct-upload/).

You will use the [wrangler](https://developers.cloudflare.com/pages/platform/using-wrangler) CLI to upload the static report.

You will need to init wrangler and configure it for your requirements.

```bash
wrangler init
```

You can then run the following command to generate the static report and upload it to CloudFlare Pages.

```bash
unlighthouse-ci --site www.example.com --build-static && wrangler pages publish .unlighthouse 
```

## GitHub Actions & Netlify Example

This example is for GitHub Actions and deploys a static client build to Netlify.

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
        run: unlighthouse-ci --site <your-site> --build-static

      - name: Deploy report to Netlify
        uses: nwtgck/actions-netlify@v1.2
        with:
          publish-dir: './.unlighthouse'
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




